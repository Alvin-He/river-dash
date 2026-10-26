pub const BCAST_STREAM_MAX_CAP: usize = 32;
pub const THREAD_DEDICATED_MIN_LOOP_DELTA: time::Duration = time::Duration::from_millis(8);

use std::time;

use nile_common::{
	comms::stream::{
		client::StreamClient,
		raw::{Dec, StreamEvent, Value, ValueUpdate},
	},
	log::Message,
	time::MonoTime,
};

struct NILEValueUpdate {
	pub value: Value,
	pub dec: Dec,
	pub timestamp: MonoTime,
}

pub struct NileClient {
	client: StreamClient,
	stream_vals: tokio::sync::broadcast::Sender<NILEValueUpdate>,
	stream_msgs: tokio::sync::broadcast::Sender<Message<'static>>,
}

impl NileClient {
	/// Creates a new [`NileClient`].
	pub fn new(client: StreamClient) -> NileClient {
		NileClient {
			client,
			stream_vals: tokio::sync::broadcast::Sender::new(BCAST_STREAM_MAX_CAP),
			stream_msgs: tokio::sync::broadcast::Sender::new(BCAST_STREAM_MAX_CAP),
		}
	}

	// get a receiver for stream values
	pub fn get_stream_values(self) -> tokio::sync::broadcast::Receiver<NILEValueUpdate> {
		self.stream_vals.subscribe()
	}

	// get a receiver for stream messages
	pub fn get_stream_messages(self) -> tokio::sync::broadcast::Receiver<Message<'static>> {
		self.stream_msgs.subscribe()
	}

	fn receive(&mut self) {
		match self.client.next_event() {
			Ok(Some(StreamEvent::MessageLogged(msg))) => {
				// pass message to nile logger?

				// update all broadcast receivers
				self.stream_msgs.send(msg.to_static());
			}
			Ok(Some(StreamEvent::Ping(ping))) => {
				// handle pings
			}
			Ok(Some(StreamEvent::ValueDeclared(name, d))) => {}
			Ok(Some(StreamEvent::ValueUndeclared(d))) => {
				// we do not handle this at all. Alvin confirmed okay behavior with Evan
			}
			Ok(Some(StreamEvent::ValueUpdated(u))) => {
				let dec = if let Some(d) = self.client.lookup(u.dec_handle) {
					d
				} else {
					return;
				};

				self.stream_vals.send(NILEValueUpdate {
					value: u.value,
					dec: dec.clone(),
					timestamp: u.timestamp,
				});
			}
			Ok(None) => {}
			Err(e) => {
				println!("Got error: {}", e);
			}
		}
	}

	/// Run a tokio green processing thread
	pub async fn run_green_thread(mut self) {
		loop {
			self.receive();
			// give the rest of the tasks a chance to run
			tokio::task::yield_now().await;
		}
	}

	/// Run a full system native processing thread
	pub fn run_full_thread(mut self) {
		let mut lut = time::Instant::now();
		loop {
			self.receive();

			// ensure time between loop runs is with in THREAD_DEDICATED_MIN_LOOP_DELTA
			// to reduce unnecessary CPU usage
			let now = time::Instant::now();
			let delta = now - lut;
			if delta < THREAD_DEDICATED_MIN_LOOP_DELTA {
				std::thread::sleep(THREAD_DEDICATED_MIN_LOOP_DELTA - delta);
			}
			lut = now;
		}
	}
}
