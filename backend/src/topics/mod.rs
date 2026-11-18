use itertools::Itertools;
use std::{
	collections::HashMap,
	ops::{Deref, DerefMut},
	sync::Arc,
	time::SystemTime,
};
use tokio::sync::{
	Mutex,
	broadcast::{self, error::RecvError},
};

use crate::stream::{
	replication::{JSONMsg, ReplicationServer},
	schema::{
		AdtD, AdtU, DataType, EnumD, EnumU, GroupD, GroupU, MessageD, MessageU,
		NetworkStreamMessageS, NetworkStreamMessageType, NumberBigIntegerU,
		NumberDecimalU, NumberNorIntegerU, NumberSizedD, RawJson, TopicD,
		TopicOpenMode, TopicU, TopicValueU, TypedValueD,
	},
};

#[derive(Debug, Clone, PartialEq)]
pub enum DefTypes {
	F32,
	F64,

	I16,
	I32,
	I64,

	U16,
	U32,
	U64,

	Message,

	Enumeration(HashMap<i32, String>),
	Record(Vec<(String, DefTypes)>),
	ADT(HashMap<i32, (String, DefTypes)>),

	Group(Vec<(String, DefTypes)>),
}

impl From<&DefTypes> for DataType {
	fn from(value: &DefTypes) -> Self {
		match value {
			DefTypes::F32 => DataType::F32,
			DefTypes::F64 => DataType::F64,
			DefTypes::I16 => DataType::I16,
			DefTypes::I32 => DataType::I32,
			DefTypes::I64 => DataType::I64,
			DefTypes::U16 => DataType::U16,
			DefTypes::U32 => DataType::U32,
			DefTypes::U64 => DataType::U64,
			DefTypes::Message => DataType::Message,
			DefTypes::Enumeration(_) => DataType::Enum,
			DefTypes::Record(_) => DataType::Record,
			DefTypes::ADT(_) => DataType::ADT,
			DefTypes::Group(_) => DataType::Group,
		}
	}
}

impl From<&DefTypes> for ImplTypes {
	fn from(value: &DefTypes) -> Self {
		match value {
			DefTypes::F32 => ImplTypes::F32(0.0),
			DefTypes::F64 => ImplTypes::F64(0.0),
			DefTypes::I16 => ImplTypes::I16(0),
			DefTypes::I32 => ImplTypes::I32(0),
			DefTypes::I64 => ImplTypes::I64(0),
			DefTypes::U16 => ImplTypes::U16(0),
			DefTypes::U32 => ImplTypes::U32(0),
			DefTypes::U64 => ImplTypes::U64(0),
			DefTypes::Message => ImplTypes::Message("".to_owned()),
			DefTypes::Enumeration(_) => ImplTypes::Enumeration(None),
			DefTypes::Record(v) => {
				ImplTypes::Record(Vec::with_capacity(v.capacity()))
			}
			// SAFETY: Data being uninit is fine as variant is None with DNE. Thus Data is not meaningful anyways
			DefTypes::ADT(_) => {
				ImplTypes::ADT(None, unsafe { Box::new_uninit().assume_init() })
			}
			DefTypes::Group(v) => {
				ImplTypes::Group(Vec::with_capacity(v.capacity()))
			}
		}
	}
}

impl DefTypes {
	fn network_serialize_declare(
		&self,
	) -> Result<Box<serde_json::value::RawValue>, serde_json::Error> {
		match self {
			DefTypes::F32
			| DefTypes::F64
			| DefTypes::I16
			| DefTypes::I32
			| DefTypes::I64
			| DefTypes::U16
			| DefTypes::U32
			| DefTypes::U64 => serde_json::value::to_raw_value(&NumberSizedD {}),
			DefTypes::Message => serde_json::value::to_raw_value(&MessageD {}),
			DefTypes::Enumeration(e) => {
				serde_json::value::to_raw_value(&EnumD {
					variants: e
						.iter()
						.map(|(i, n)| (*i, n.as_ref()))
						.collect::<Vec<_>>()
						.into(),
				})
			}
			DefTypes::Group(items) | DefTypes::Record(items) => {
				serde_json::value::to_raw_value(
					&items
						.iter()
						.map(|(name, t)| {
							Ok(TypedValueD {
								data_type: t.into(),
								name: name.as_ref(),
								value: t.network_serialize_declare()?,
							})
						})
						.try_collect::<_, Vec<TypedValueD>, _>()?,
				)
			}
			DefTypes::ADT(variants) => serde_json::value::to_raw_value(&AdtD {
				variants: variants
					.iter()
					.map(|(i, (name, t))| {
						Ok((
							*i,
							TypedValueD {
								data_type: t.into(),
								name: name.as_ref(),
								value: t.network_serialize_declare()?,
							},
						))
					})
					.try_collect()?,
			}),
		}
	}

	fn network_deserialize_declare(
		data_type: DataType,
		value: RawJson,
	) -> Result<DefTypes, serde_json::Error> {
		Ok(match data_type {
			DataType::I16 => DefTypes::I16,
			DataType::I32 => DefTypes::I32,
			DataType::I64 => DefTypes::I64,
			DataType::U16 => DefTypes::U16,
			DataType::U32 => DefTypes::U32,
			DataType::U64 => DefTypes::U64,
			DataType::F32 => DefTypes::F32,
			DataType::F64 => DefTypes::F64,
			DataType::Message => DefTypes::Message,
			DataType::Enum => DefTypes::Enumeration(HashMap::from_iter(
				serde_json::from_str::<EnumD>(value.get())?
					.variants
					.into_iter()
					.map(|v| (v.0, v.1.to_owned())),
			)),
			DataType::Group => DefTypes::Group(
				serde_json::from_str::<GroupD>(value.get())?
					.into_iter()
					.map(|v| {
						Ok((
							v.name.to_owned(),
							Self::network_deserialize_declare(
								v.data_type,
								v.value,
							)?,
						))
					})
					.try_collect()?,
			),
			DataType::Record => DefTypes::Record(
				serde_json::from_str::<GroupD>(value.get())?
					.into_iter()
					.map(|v| {
						Ok((
							v.name.to_owned(),
							Self::network_deserialize_declare(
								v.data_type,
								v.value,
							)?,
						))
					})
					.try_collect()?,
			),
			DataType::ADT => DefTypes::ADT(HashMap::from_iter(
				serde_json::from_str::<AdtD>(value.get())?
					.variants
					.into_iter()
					.map(|(i, val)| {
						Ok((
							i,
							(
								val.name.to_owned(),
								Self::network_deserialize_declare(
									val.data_type,
									val.value,
								)?,
							),
						))
					})
					.try_collect::<_, Vec<(i32, (String, Self))>, _>()?,
			)),
		})
	}
}

#[derive(Debug, Clone, PartialEq)]
pub enum ImplTypes {
	F32(f32),
	F64(f64),

	I16(i16),
	I32(i32),
	I64(i64),

	U16(u16),
	U32(u32),
	U64(u64),

	Message(String),

	Enumeration(Option<i32>),
	Record(Vec<ImplTypes>),
	ADT(Option<i32>, Box<ImplTypes>),

	Group(Vec<ImplTypes>),
}

impl From<&ImplTypes> for DataType {
	fn from(value: &ImplTypes) -> Self {
		match value {
			ImplTypes::F32(_) => DataType::F32,
			ImplTypes::F64(_) => DataType::F64,
			ImplTypes::I16(_) => DataType::I16,
			ImplTypes::I32(_) => DataType::I32,
			ImplTypes::I64(_) => DataType::I64,
			ImplTypes::U16(_) => DataType::U16,
			ImplTypes::U32(_) => DataType::U32,
			ImplTypes::U64(_) => DataType::U64,
			ImplTypes::Message(_) => DataType::Message,
			ImplTypes::Enumeration(_) => DataType::Enum,
			ImplTypes::Record(_) => DataType::Record,
			ImplTypes::ADT(_, _) => DataType::ADT,
			ImplTypes::Group(_) => DataType::Group,
		}
	}
}

impl ImplTypes {
	pub fn network_serialize_update(
		&self,
	) -> Result<RawJson, serde_json::Error> {
		match self {
			ImplTypes::F32(v) => {
				serde_json::value::to_raw_value(&NumberDecimalU {
					decimal: *v as f64,
				})
			}
			ImplTypes::F64(v) => {
				serde_json::value::to_raw_value(&NumberDecimalU { decimal: *v })
			}
			ImplTypes::I16(i) => {
				serde_json::value::to_raw_value(&NumberNorIntegerU {
					int: *i as i64,
				})
			}
			ImplTypes::I32(i) => {
				serde_json::value::to_raw_value(&NumberNorIntegerU {
					int: *i as i64,
				})
			}
			ImplTypes::I64(i) => {
				serde_json::value::to_raw_value(&NumberBigIntegerU {
					big: *i as i128,
				})
			}
			ImplTypes::U16(i) => {
				serde_json::value::to_raw_value(&NumberNorIntegerU {
					int: *i as i64,
				})
			}
			ImplTypes::U32(i) => {
				serde_json::value::to_raw_value(&NumberNorIntegerU {
					int: *i as i64,
				})
			}
			ImplTypes::U64(i) => {
				serde_json::value::to_raw_value(&NumberBigIntegerU {
					big: *i as i128,
				})
			}
			ImplTypes::Message(s) => {
				serde_json::value::to_raw_value(&MessageU { str: s.as_ref() })
			}
			ImplTypes::Enumeration(i) => {
				serde_json::value::to_raw_value(&EnumU { variant: *i })
			}
			ImplTypes::Record(items) => serde_json::value::to_raw_value(
				&items
					.iter()
					.map(|x| x.network_serialize_update())
					.try_collect::<_, GroupU, _>()?,
			),
			ImplTypes::Group(items) => serde_json::value::to_raw_value(
				&items
					.iter()
					.map(|x| x.network_serialize_update())
					.try_collect::<_, GroupU, _>()?,
			),
			ImplTypes::ADT(i, v) => serde_json::value::to_raw_value(&AdtU {
				variant: *i,
				value: if i.is_some() {
					Some(v.network_serialize_update()?)
				} else {
					None
				},
			}),
		}
	}

	pub fn network_deserialize_update(
		&mut self,
		value: RawJson,
	) -> Result<(), serde_json::Error> {
		match self {
			ImplTypes::F32(f) => {
				*f = serde_json::from_str::<NumberDecimalU>(value.get())?
					.decimal as f32
			}
			ImplTypes::F64(f) => {
				*f =
					serde_json::from_str::<NumberDecimalU>(value.get())?.decimal
			}
			ImplTypes::I16(i) => {
				*i = serde_json::from_str::<NumberNorIntegerU>(value.get())?.int
					as i16
			}
			ImplTypes::I32(i) => {
				*i = serde_json::from_str::<NumberNorIntegerU>(value.get())?.int
					as i32
			}
			ImplTypes::I64(i) => {
				*i = serde_json::from_str::<NumberBigIntegerU>(value.get())?.big
					as i64
			}
			ImplTypes::U16(u) => {
				*u = serde_json::from_str::<NumberNorIntegerU>(value.get())?.int
					as u16
			}
			ImplTypes::U32(u) => {
				*u = serde_json::from_str::<NumberNorIntegerU>(value.get())?.int
					as u32
			}
			ImplTypes::U64(u) => {
				*u = serde_json::from_str::<NumberBigIntegerU>(value.get())?.big
					as u64
			}
			ImplTypes::Message(s) => {
				let temp = serde_json::from_str::<MessageU>(value.get())?.str;
				s.clear();
				s.push_str(temp);
			}
			ImplTypes::Enumeration(i) => {
				*i = serde_json::from_str::<EnumU>(value.get())?.variant
			}
			ImplTypes::Record(items) => {
				for (value, item) in
					serde_json::from_str::<GroupU>(value.get())?
						.into_iter()
						.zip::<&mut Vec<ImplTypes>>(items.into())
				{
					item.network_deserialize_update(value)?
				}
			}
			ImplTypes::Group(items) => {
				for (value, item) in
					serde_json::from_str::<GroupU>(value.get())?
						.into_iter()
						.zip::<&mut Vec<ImplTypes>>(items.into())
				{
					item.network_deserialize_update(value)?
				}
			}
			ImplTypes::ADT(i, data) => {
				let adt = serde_json::from_str::<AdtU>(value.get())?;
				*i = adt.variant;
				if let Some(v) = adt.value {
					data.network_deserialize_update(v)?
				};
			}
		};
		Ok(())
	}
}

macro_rules! impl_try_from_for_type {
	($t: ty, $v: ident) => {
		impl TryFrom<ImplTypes> for $t {
			type Error = &'static str;

			fn try_from(value: ImplTypes) -> Result<Self, Self::Error> {
				match value {
					ImplTypes::$v(v) => Ok(v),
					_ => Err("Bad Type"),
				}
			}
		}
	};
}

impl_try_from_for_type!(i16, I16);
impl_try_from_for_type!(i32, I32);
impl_try_from_for_type!(i64, I64);
impl_try_from_for_type!(u16, U16);
impl_try_from_for_type!(u32, U32);
impl_try_from_for_type!(u64, U64);
impl_try_from_for_type!(f32, F32);
impl_try_from_for_type!(f64, F64);
impl_try_from_for_type!(String, Message);

#[derive(Debug, Clone)]
#[repr(transparent)]
pub struct Wrapper<T>(pub T);
impl<T> Deref for Wrapper<T> {
	type Target = T;

	fn deref(&self) -> &Self::Target {
		&self.0
	}
}
impl<T> DerefMut for Wrapper<T> {
	fn deref_mut(&mut self) -> &mut Self::Target {
		&mut self.0
	}
}
impl<T: TryFrom<i32>> TryFrom<i32> for Wrapper<T> {
	type Error = T::Error;

	fn try_from(value: i32) -> Result<Self, Self::Error> {
		Ok(Self(value.try_into()?))
	}
}

impl<T: TryFrom<i32>> TryFrom<ImplTypes> for Wrapper<T> {
	type Error = &'static str;

	fn try_from(value: ImplTypes) -> Result<Self, Self::Error> {
		match value {
			ImplTypes::Enumeration(Some(v)) => {
				Ok(v.try_into().map_err(|_| "Bad Variant")?)
			}
			_ => Err("Bad Type"),
		}
	}
}
impl<T: TryFrom<ImplTypes>> TryFrom<ImplTypes> for Vec<T> {
	type Error = &'static str;

	fn try_from(value: ImplTypes) -> Result<Self, Self::Error> {
		match value {
			ImplTypes::Record(v) | ImplTypes::Group(v) => Ok(v
				.into_iter()
				.map(|x| x.try_into())
				.try_collect()
				.map_err(|_| "Bad Conversion")?),
			_ => Err("Bad Type"),
		}
	}
}

#[derive(Debug, Clone, PartialEq)]
pub struct TopicUpdate {
	data: ImplTypes,
	ts: SystemTime,
}

impl TopicUpdate {
	pub const fn new(data: ImplTypes, ts: SystemTime) -> Self {
		Self { data, ts }
	}

	pub const fn get_data(&self) -> &ImplTypes {
		&self.data
	}

	pub const fn get_timestamp(&self) -> &SystemTime {
		&self.ts
	}

	pub fn clone_as<T: TryFrom<ImplTypes, Error = &'static str>>(
		&self,
	) -> Result<T, &'static str> {
		self.data.clone().try_into()
	}

	pub fn try_set_data(
		&mut self,
		data: ImplTypes,
		ts: SystemTime,
	) -> Result<&Self, &'static str> {
		if Into::<DataType>::into(&self.data) != (&data).into() {
			return Err("Not the same type!");
		}

		self.data = data;
		self.ts = ts;

		Ok(self)
	}

	pub fn network_serialize_update_msg(
		&self,
		topic_name: impl AsRef<str>,
	) -> Result<JSONMsg, serde_json::Error> {
		serde_json::to_string(&NetworkStreamMessageS {
			name: topic_name.as_ref(),
			message_type: NetworkStreamMessageType::Update,
			data: serde_json::value::to_raw_value::<TopicU>(&TopicU::Value(
				TopicValueU {
					data: self.data.network_serialize_update()?,
					ts: self.ts,
				},
			))?,
		})
		.map(|v| v.into())
	}
}

#[derive(Debug)]
pub struct Topic {
	name: String,
	mode: TopicOpenMode,
	def: DefTypes,
	stream: broadcast::Sender<TopicUpdate>,
	peer_mode: Option<TopicOpenMode>,
}

impl Topic {
	pub fn new(
		name: String,
		mode: TopicOpenMode,
		definition: DefTypes,
	) -> Self {
		Self {
			name,
			mode,
			def: definition,
			peer_mode: None,
			stream: broadcast::Sender::new(128),
		}
	}

	pub const fn get_name(&self) -> &str {
		self.name.as_str()
	}

	pub const fn get_mode(&self) -> &TopicOpenMode {
		&self.mode
	}

	pub fn subscribe(&self) -> broadcast::Receiver<TopicUpdate> {
		self.stream.subscribe()
	}

	pub fn publish(&self) -> broadcast::Sender<TopicUpdate> {
		self.stream.clone()
	}

	fn replicate_network(&self, server: &ReplicationServer) {
		let mut rx = self.stream.subscribe();
		let tx = server.publish_outgoing();
		let name = self.name.clone();

		tokio::spawn(async move {
			loop {
				match rx.recv().await {
					Ok(u) => {
						let json = u.network_serialize_update_msg(&name);
						match json {
							Ok(bytes) => _ = tx.send(bytes),
							Err(e) => {
								println!("Unable to serialize update: {e}");
							}
						}
					}
					Err(RecvError::Closed) => {
						println!("Topic self stream close.");
						break;
					}
					Err(RecvError::Lagged(n)) => {
						println!("Topic self stream lagged {n}");
					}
				}
			}
		});
	}

	pub fn network_serialize_declare_msg(
		&self,
	) -> Result<JSONMsg, serde_json::Error> {
		serde_json::to_string(&NetworkStreamMessageS {
			name: &self.name,
			message_type: NetworkStreamMessageType::Declare,
			data: serde_json::value::to_raw_value::<TopicD>(&TopicD {
				name: self.name.as_ref(),
				mode: self.peer_mode.clone().unwrap_or(TopicOpenMode::Read),
				data_type: (&self.def).into(),
				declaration: self.def.network_serialize_declare()?,
			})?,
		})
		.map(|s| s.into())
	}
	pub fn network_deserialize_declare(
		value: RawJson,
	) -> Result<Self, serde_json::Error> {
		let d = serde_json::from_str::<TopicD>(value.get())?;

		Ok(Self::new(
			d.name.to_owned(),
			d.mode,
			DefTypes::network_deserialize_declare(d.data_type, d.declaration)?,
		))
	}

	pub fn network_deserialize_update(
		&self,
		value: RawJson,
	) -> Result<(), serde_json::Error> {
		match serde_json::from_str::<TopicU>(value.get())? {
			TopicU::Value(topic_value_u) => {
				let mut t = TopicUpdate {
					data: (&self.def).into(),
					ts: topic_value_u.ts,
				};
				t.data.network_deserialize_update(topic_value_u.data)?
			}
			TopicU::Empty {} => {}
		};

		Ok(())
	}
}

#[derive(Debug)]
pub struct TopicRegistryData {
	network_topics: HashMap<String, Arc<Topic>>,
	local_topics: HashMap<String, Arc<Topic>>,
	rc_server: ReplicationServer,
	tx: broadcast::Sender<JSONMsg>,
}

impl TopicRegistryData {
	pub fn init_local_topic(&mut self, topic: Topic) -> &mut Self {
		self.local_topics
			.insert(topic.get_name().into(), topic.into());
		self
	}

	pub fn init_network_topic(
		&mut self,
		mut topic: Topic,
		peer_mode: TopicOpenMode,
	) -> &mut Self {
		// Declear topic otn
		self.send_topic_declare(&mut topic, peer_mode);

		// Replicate topic otn
		topic.replicate_network(&self.rc_server);
		self.network_topics
			.insert(topic.get_name().into(), topic.into());

		self
	}

	pub fn get_topic(&self, name: impl AsRef<str>) -> Option<Arc<Topic>> {
		self.network_topics
			.get(name.as_ref())
			.or_else(|| self.local_topics.get(name.as_ref()))
			.map(|v| v.clone())
	}

	fn send_topic_declare(&self, topic: &mut Topic, peer_mode: TopicOpenMode) {
		topic.peer_mode = Some(peer_mode);
		let msg = match topic.network_serialize_declare_msg() {
			Ok(v) => v,
			Err(e) => {
				println!("Unable to serialize declare: {e}");
				return;
			}
		};

		_ = self.tx.send(msg);
	}
}

#[derive(Debug, Clone)]
#[repr(transparent)]
pub struct TopicRegistry(Arc<Mutex<TopicRegistryData>>);
impl Deref for TopicRegistry {
	type Target = Mutex<TopicRegistryData>;

	fn deref(&self) -> &Self::Target {
		self.0.as_ref()
	}
}

impl TopicRegistry {
	pub fn new(rc_server: &ReplicationServer) -> Self {
		let this = Self(Arc::new(Mutex::new(TopicRegistryData {
			network_topics: HashMap::new(),
			local_topics: HashMap::new(),
			tx: rc_server.publish_outgoing(),
			rc_server: rc_server.clone(),
		})));
		this.replicate_rx();
		this.watch_bootstrap();
		this
	}

	fn replicate_rx(&self) {
		let this = self.clone();
		tokio::spawn(async move {
			let mut rx = { this.lock().await.rc_server.subscribe_incoming() };

			loop {
				match rx.recv().await {
					Ok(msg) => {
						let deserialized = match serde_json::from_str::<
							NetworkStreamMessageS,
						>(&msg)
						{
							Ok(m) => m,
							Err(e) => {
								println!("Unable to deserialize message! {e}");
								continue;
							}
						};

						match deserialized.message_type {
							NetworkStreamMessageType::Update => {
								let topic = {
									let lock = this.lock().await;
									if let Some(t) = lock
										.network_topics
										.get(deserialized.name)
									{
										t.clone()
									} else {
										continue;
									}
								};

								if let Err(e) = topic
									.network_deserialize_update(
										deserialized.data,
									) {
									println!(
										"Unable to deserialize update! {e}"
									);
									continue;
								};
							}
							NetworkStreamMessageType::Declare => {
								let dec =
									match Topic::network_deserialize_declare(
										deserialized.data,
									) {
										Ok(t) => Arc::new(t),
										Err(e) => {
											println!(
												"Unable to deserialize declare! {e}"
											);
											continue;
										}
									};

								this.lock()
									.await
									.network_topics
									.insert(deserialized.name.to_owned(), dec);
							}
						}
					}
					Err(RecvError::Closed) => {
						println!("TR Replicate rx closed.");
						break;
					}
					Err(RecvError::Lagged(n)) => {
						// println!("TR Replicate lagged {n}");
						continue;
					}
				}
			}
		});
	}

	fn watch_bootstrap(&self) {
		let this = self.clone();
		tokio::spawn(async move {
			let mut bootstrap =
				{ this.lock().await.rc_server.watch_bootstrap() };
				
			loop {
				let tx = match bootstrap.recv().await {
					Ok(v) => v,
					Err(RecvError::Closed) => {
						println!("Bootstrap watcher closed.");
						return;
					}
					Err(RecvError::Lagged(n)) => {
						println!("Bootstrap watcher lagged {n}!");
						continue;
					}
				};

				let lock = this.lock().await;
				lock.network_topics
					.iter()
					.map(|e| e.1.network_serialize_declare_msg())
					.for_each(|res| match res {
						Ok(msg) => _ = tx.send(msg),
						Err(e) => {
							println!(
								"Unable to serialize declare for bootstrap! {e}"
							);
						}
					});

				println!("Sent Bootstrap");
			}
		});
	}
}
