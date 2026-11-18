use std::sync::Arc;

use axum::extract::ws::{Message, Utf8Bytes, WebSocket};
use futures_util::{
	SinkExt, StreamExt,
	stream::{SplitSink, SplitStream},
};
use tokio::sync::{
	Mutex, Notify,
	broadcast::{self, error::RecvError},
};

pub type JSONMsg = Utf8Bytes;

#[derive(Debug, Clone)]
pub struct ReplicationServer {
	channel: broadcast::Sender<JSONMsg>,
	// subscribe to this channel to receive bootstrap information
	bootstrap: broadcast::Sender<broadcast::Sender<JSONMsg>>,
}

impl ReplicationServer {
	pub fn new() -> Self {
		Self {
			channel: broadcast::Sender::new(128),
			bootstrap: broadcast::Sender::new(128),
		}
	}

	pub fn subscribe_incoming(&self) -> broadcast::Receiver<JSONMsg> {
		self.channel.subscribe()
	}

	pub fn publish_outgoing(&self) -> broadcast::Sender<JSONMsg> {
		self.channel.clone()
	}

	pub fn request_bootstrap(&self) -> broadcast::Receiver<JSONMsg> {
		println!("Request Bootstrap");
		let (sender, receiver) = broadcast::channel(128);
		_ = self.bootstrap.send(sender);
		receiver
	}

	/// Watch the bootstrap channel. All Senders received from boot strap must be dropped in
	/// order to signal that bootstrap have been finished.
	pub fn watch_bootstrap(
		&self,
	) -> broadcast::Receiver<broadcast::Sender<JSONMsg>> {
		self.bootstrap.subscribe()
	}
}

pub trait ReplicationNode {
	fn replicate_to(self, server: &ReplicationServer);
}

#[derive(Debug)]
pub struct WebsocketReplicationNode {
	tx: SplitSink<WebSocket, Message>,
	rx: SplitStream<WebSocket>,
}
impl WebsocketReplicationNode {
	pub fn new(socket: WebSocket) -> Self {
		let (tx, rx) = socket.split();

		Self { rx, tx }
	}
}
impl ReplicationNode for WebsocketReplicationNode {
	fn replicate_to(self, server: &ReplicationServer) {
		let mut rep_rx = server.subscribe_incoming();
		let rep_tx = server.publish_outgoing();
		let server = server.clone();

		let (mut tx, mut rx) = (self.tx, self.rx);

		// incoming -> self outgoing
		tokio::spawn(async move {
			Self::bootstrap(&server, &mut tx).await;
			loop {
				match rep_rx.recv().await {
					Ok(data) => {
						if let Err(e) = tx.send(Message::Text(data)).await {
							println!(
								"Replication to WebSocket encountered an error: {e}"
							);
							println!("Stopping Replication.");
							break;
						};
					}
					Err(RecvError::Closed) => {
						println!("WebSocket closed, stopping replication out.");
						break;
					}
					Err(RecvError::Lagged(n)) => {
						println!("WebSocket Replication lagged {n}");
						continue;
					}
				}
			}
			// clean up
			_ = tx.close().await;
		});

		// self incoming -> outgoing
		tokio::spawn(async move {
			while let Some(Ok(msg)) = rx.next().await {
				match msg {
					Message::Text(utf8_bytes) => {
						_ = rep_tx.send(utf8_bytes);
					}
					Message::Binary(_) => {
						println!("Only text data supported!");
					}
					Message::Ping(_) => {}
					Message::Pong(_) => {}
					Message::Close(_) => {}
				}
			}
		});
	}
}

impl WebsocketReplicationNode {
	async fn bootstrap(
		server: &ReplicationServer,
		tx: &mut SplitSink<WebSocket, Message>,
	) {
		let mut recv = server.request_bootstrap();
		loop {
			match recv.recv().await {
				Ok(data) => {
					println!("Send Bootstrap msg {data}");
					if let Err(e) = tx.send(Message::Text(data)).await {
						println!(
							"Replication to WebSocket encountered an error: {e}"
						);
						println!("Stopping Bootstrap.");
						break;
					};
				}
				Err(RecvError::Closed) => {
					println!("Bootstrap closed. Bootstrap finished.");
					break;
				}
				Err(RecvError::Lagged(n)) => {
					println!("Bootstrap lagged {n}!");
					continue;
				}
			}
		}
	}
}
