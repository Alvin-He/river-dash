pub const BCAST_STREAM_MAX_CAP: usize = 32;
pub const THREAD_DEDICATED_MIN_LOOP_DELTA: time::Duration =
	time::Duration::from_millis(8);

use std::{
	collections::HashMap,
	sync::{Arc, Mutex},
	time::{self, Duration, SystemTime, UNIX_EPOCH},
};

use nile_common::log;
use nile_common::{
	comms::stream::{
		client::StreamClient,
		raw::{Dec, DecHandle, StreamEvent, Value, ValueUpdate},
	},
	log::{Message, Severity},
	time::MonoTime,
};
use tokio::{sync::broadcast, task::spawn_blocking};

use crate::{
	LOG_TAG,
	stream::schema::TopicOpenMode,
	topics::{DefTypes, ImplTypes, Topic, TopicRegistry, TopicUpdate},
};

pub const NILE_MESSAGES_TOPIC: &'static str = "nile_messages";

pub struct NileClient {
	client: StreamClient,
	topic_register: TopicRegistry,
	map_value_sender: HashMap<DecHandle, broadcast::Sender<TopicUpdate>>,
	msg_sender: broadcast::Sender<TopicUpdate>,
}

impl NileClient {
	/// Creates a new [`NileClient`].
	pub fn new(
		client: StreamClient,
		topic_register: TopicRegistry,
	) -> NileClient {
		// Topic Register is held here
		tokio::task::block_in_place(|| {
			let sender: broadcast::Sender<TopicUpdate>;

			// Topic register is held here
			{
				let mut register = topic_register.blocking_lock();

				sender = if let Some(t) =
					register.get_topic(NILE_MESSAGES_TOPIC)
				{
					t.publish()
				} else {
					let t = Topic::new(
						NILE_MESSAGES_TOPIC.to_owned(),
						TopicOpenMode::ReadWriteMany,
						DefTypes::Message,
					);
					let p = t.publish();
					register
						.init_network_topic(t, TopicOpenMode::ReadWriteMany);
					p
				};
			}

			NileClient {
				client,
				topic_register,
				map_value_sender: HashMap::new(),
				msg_sender: sender,
			}
		})
	}

	async fn receive(&mut self) {
		match self.client.next_event() {
			Ok(Some(StreamEvent::MessageLogged(msg))) => {
				// pass message to nile logger?

				let severity_note = match msg.severity {
					nile_common::log::Severity::Debug => "[DBG]",
					nile_common::log::Severity::Info => "[INF]",
					nile_common::log::Severity::Warning => "[WRN]",
					nile_common::log::Severity::Error => "[ERR]",
					nile_common::log::Severity::Critical => "[CRT]",
				};

				let line = format!(
					"{:>16}µs {} <{}> {}\n",
					msg.timestamp.micros(),
					severity_note,
					msg.tag,
					msg.message
				);

				// update topic
				_ = self.msg_sender.send(TopicUpdate::new(
					ImplTypes::Message(line),
					UNIX_EPOCH + Duration::from_micros(msg.timestamp.micros()),
				));
			}
			Ok(Some(StreamEvent::Ping(ping))) => {
				log!(
					Severity::Debug,
					LOG_TAG,
					"Got Nile Stand ping from time `{}`",
					ping.micros()
				);
			}
			Ok(Some(StreamEvent::ValueDeclared(name, d))) => {
				let dec = if let Some(v) = self.client.lookup(d) {
					v
				} else {
					log!(
						Severity::Error,
						LOG_TAG,
						"CRITICAL: DecHandle given but can not be looked up!"
					);
					return;
				};

				log!(Severity::Info, LOG_TAG, "Got Declaration from NILE Stand for `{name}`");

				let topic = Topic::new(
					name,
					TopicOpenMode::Read,
					Self::from_nile_dec_to_def(dec),
				);

				self.map_value_sender.insert(d, topic.publish());
				// topic register mutex held
				{
					self.topic_register
						.lock()
						.await
						.init_network_topic(topic, TopicOpenMode::Read);
				}
			}
			Ok(Some(StreamEvent::ValueUndeclared(_d))) => {
				// we do not handle this at all. Alvin confirmed okay behavior with Evan
			}
			Ok(Some(StreamEvent::ValueUpdated(u))) => {
				let sender =
					if let Some(v) = self.map_value_sender.get(&u.dec_handle) {
						v
					} else {
						log!(
							Severity::Error,
							LOG_TAG,
							"DecHandle `{}` does not map to a topic!",
							u.dec_handle
						);
						return;
					};

				log!(Severity::Debug, LOG_TAG, "Received Update");

				_ = sender.send(TopicUpdate::new(
					Self::from_nile_val_to_impl(u.value),
					UNIX_EPOCH + Duration::from_micros(u.timestamp.micros()),
				));
			}
			Ok(None) => {}
			Err(e) => {
				log!(Severity::Error, LOG_TAG, "Error on NILE Stand connection: {}", e);
			}
		}
	}

	/// Run a tokio green processing thread
	pub fn run_green_thread(mut self) {
		tokio::task::spawn(async move {
			loop {
				self.receive().await;
			}
		});
	}

	/// Run a full system native processing thread
	pub fn run_full_thread(mut self) {
		let handle = tokio::runtime::Handle::current();

		tokio::task::spawn_blocking(move || {
			// let mut lut = time::Instant::now();
			loop {
				handle.block_on(self.receive());

				// ensure time between loop runs is with in THREAD_DEDICATED_MIN_LOOP_DELTA
				// to reduce unnecessary CPU usage
				// let now = time::Instant::now();
				// let delta = now - lut;
				// if delta < THREAD_DEDICATED_MIN_LOOP_DELTA {
				// 	std::thread::sleep(THREAD_DEDICATED_MIN_LOOP_DELTA - delta);
				// }
				// lut = now;
			}
		});
	}

	/// convert a nile common value to ImplTypes
	fn from_nile_val_to_impl(value: Value) -> ImplTypes {
		match value {
			Value::F32(v) => ImplTypes::F32(v),
			Value::F64(v) => ImplTypes::F64(v),
			Value::I16(v) => ImplTypes::I16(v),
			Value::I32(v) => ImplTypes::I32(v),
			Value::I64(v) => ImplTypes::I64(v),
			Value::U16(v) => ImplTypes::U16(v),
			Value::U32(v) => ImplTypes::U32(v),
			Value::U64(v) => ImplTypes::U64(v),
			Value::Enumeration(v) => ImplTypes::Enumeration(Some(v)),
			Value::Record(values) => ImplTypes::Record(
				values
					.into_iter()
					.map(|v| Self::from_nile_val_to_impl(v))
					.collect(),
			),
			Value::ADT(i, value) => ImplTypes::ADT(
				Some(i),
				Box::new(Self::from_nile_val_to_impl(*value)),
			),
			Value::Group(values) => ImplTypes::Group(
				values
					.into_iter()
					.map(|v| Self::from_nile_val_to_impl(v))
					.collect(),
			),
		}
	}

	/// convert a nile common Dec to DefTypes
	fn from_nile_dec_to_def(dec: &Dec) -> DefTypes {
		match dec {
			Dec::F32 => DefTypes::F32,
			Dec::F64 => DefTypes::F64,
			Dec::I16 => DefTypes::I16,
			Dec::I32 => DefTypes::I32,
			Dec::I64 => DefTypes::I64,
			Dec::U16 => DefTypes::U16,
			Dec::U32 => DefTypes::U32,
			Dec::U64 => DefTypes::U64,
			Dec::Enumeration(hash_map) => {
				DefTypes::Enumeration(hash_map.clone())
			}
			Dec::Record(items) => DefTypes::Record(
				items
					.iter()
					.map(|(n, d)| (n.clone(), Self::from_nile_dec_to_def(d)))
					.collect(),
			),
			Dec::ADT(hash_map) => DefTypes::ADT(
				hash_map
					.iter()
					.map(|(i, (n, d))| {
						(*i, (n.clone(), Self::from_nile_dec_to_def(d)))
					})
					.collect(),
			),
			Dec::Group(items) => DefTypes::Group(
				items
					.into_iter()
					.map(|(n, d)| (n.clone(), Self::from_nile_dec_to_def(d)))
					.collect(),
			),
		}
	}
}
