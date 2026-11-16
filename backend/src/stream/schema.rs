use serde::{Deserialize, Deserializer, Serialize, Serializer};
use std::str::FromStr;
use std::{fmt::Debug, time::SystemTime};

pub type RawJson = Box<serde_json::value::RawValue>;

pub const SCHEMA_PROTO: &'static str = "RiverDash.pubsub.v1";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum TopicOpenMode {
	#[serde(rename = "R")]
	Read,

	#[serde(rename = "RW")]
	ReadWrite,

	#[serde(rename = "RWM")]
	ReadWriteMany,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub enum DataType {
	I16,
	I32,
	I64,
	U16,
	U32,
	U64,
	F32,
	F64,
	Message,
	Enum,
	Group,
	Record,
	ADT,
}

/// serialize large numbers into and from strings instead of JSON number.
pub mod bigint_string {
	use super::*;

	pub fn serialize<S>(value: &i128, serializer: S) -> Result<S::Ok, S::Error>
	where
		S: Serializer,
	{
		serializer.serialize_str(&value.to_string())
	}

	pub fn deserialize<'de, D>(deserializer: D) -> Result<i128, D::Error>
	where
		D: Deserializer<'de>,
	{
		let value = String::deserialize(deserializer)?;
		i128::from_str(&value).map_err(serde::de::Error::custom)
	}
}

/// serializes timestamp to nanoseconds string
pub mod timestamp_string {
	use super::*;
	use std::time::{Duration, UNIX_EPOCH};

	pub fn serialize<S>(
		value: &SystemTime,
		serializer: S,
	) -> Result<S::Ok, S::Error>
	where
		S: Serializer,
	{
		serializer.serialize_str(
			&value
				.duration_since(UNIX_EPOCH)
				.map_err(|e| {
					serde::ser::Error::custom(format!(
						"Unable to serialize to epoch nanoseconds: {e}"
					))
				})?
				.as_nanos()
				.to_string(),
		)
	}

	pub fn deserialize<'de, D>(deserializer: D) -> Result<SystemTime, D::Error>
	where
		D: Deserializer<'de>,
	{
		let value = String::deserialize(deserializer)?;
		Ok(UNIX_EPOCH
			.checked_add(Duration::from_nanos_u128(
				u128::from_str(&value).map_err(|e| {
					serde::de::Error::custom(format!(
						"Unable to convert from epoch nanoseconds: {e}"
					))
				})?,
			))
			.ok_or(serde::de::Error::custom(format!(
				"Unable to convert from epoch nanoseconds: Too big"
			)))?)
	}
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, Default)]
pub struct NumberSizedD {}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NumberNorIntegerU {
	pub int: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NumberBigIntegerU {
	#[serde(with = "bigint_string")]
	pub big: i128,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NumberDecimalU {
	pub decimal: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct MessageD {}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MessageU<'a> {
	#[serde(borrow)]
	pub str: &'a str,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct EnumU {
	#[serde(default, skip_serializing_if = "Option::is_none")]
	pub variant: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EnumD<'a> {
	#[serde(borrow)]
	pub variants: Vec<(i32, &'a str)>,
}

/// Zod's `{ name, type, value }` objects used by ADT and Group declarations.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TypedValueD<'a> {
	pub name: &'a str,

	#[serde(rename = "type")]
	pub data_type: DataType,

	pub value: RawJson,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AdtD<'a> {
	#[serde(borrow)]
	pub variants: Vec<(i32, TypedValueD<'a>)>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct AdtU {
	#[serde(default, skip_serializing_if = "Option::is_none")]
	pub variant: Option<i32>,

	#[serde(default, skip_serializing_if = "Option::is_none")]
	pub value: Option<RawJson>,
}

pub type GroupD<'a> = Vec<TypedValueD<'a>>;
pub type GroupU = Vec<RawJson>;

/// The populated form of `Topic_us`.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TopicValueU {
	pub data: RawJson,

	#[serde(with = "timestamp_string")]
	pub ts: SystemTime,
}

/// `Topic_us` is either `{ data, ts }` or `{}`.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(untagged)]
pub enum TopicU {
	Value(TopicValueU),
	Empty {},
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TopicD<'a> {
	pub name: &'a str,
	pub mode: TopicOpenMode,
	#[serde(rename = "type")]
	pub data_type: DataType,

	pub declaration: RawJson,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum NetworkStreamMessageType {
	#[serde(rename = "U")]
	Update,
	#[serde(rename = "D")]
	Declare,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NetworkStreamMessageS<'a> {
	pub name: &'a str,
	#[serde(rename = "type")]
	pub message_type: NetworkStreamMessageType,
	pub data: RawJson,
}

