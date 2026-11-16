use std::sync::Arc;

use axum::extract::ws::{Message, Utf8Bytes, WebSocket};
use futures_util::{
	SinkExt, StreamExt,
	stream::{SplitSink, SplitStream},
};
use tokio::sync::{Mutex, Notify, broadcast};

pub type JSONMsg = Utf8Bytes;

#[derive(Debug, Clone)]
pub struct ReplicationServer {
	channel: broadcast::Sender<JSONMsg>,
	// subscribe to this channel to receive bootstrap information
	bootstrap: broadcast::Sender<JSONMsg>,
	bootstrap_notif: Arc<Notify>,
}

impl ReplicationServer {
	pub fn new() -> Self {
		Self {
			channel: broadcast::Sender::new(128),
			bootstrap: broadcast::Sender::new(128),
			bootstrap_notif: Notify::const_new().into(),
		}
	}

	pub fn subscribe_incoming(&self) -> broadcast::Receiver<JSONMsg> {
		self.channel.subscribe()
	}

	pub fn publish_outgoing(&self) -> broadcast::Sender<JSONMsg> {
		self.channel.clone()
	}

	pub fn request_bootstrap(&self) -> broadcast::Receiver<JSONMsg> {
		let recv = self.bootstrap.subscribe();
		self.bootstrap_notif.notify_waiters();
		recv
	}

	/// Wait for a bootstrap request. The sender must be dropped in order to signal that
	/// all bootstrap init nodes have finished
	pub async fn await_bootstrap_req(&self) -> broadcast::WeakSender<JSONMsg> {
		self.bootstrap_notif.notified().await;
		self.bootstrap.downgrade()
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
			Self::bootstrap(server, &mut tx).await;

			while let Ok(data) = rep_rx.recv().await {
				if let Err(e) = tx.send(Message::Text(data)).await {
					println!(
						"Replication to WebSocket encountered an error: {e}"
					);
					println!("Stopping Replication.");
					break;
				};
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
		server: ReplicationServer,
		tx: &mut SplitSink<WebSocket, Message>,
	) {
		let mut recv = server.request_bootstrap();
		while recv.sender_weak_count() > 0
			&& let Ok(data) = recv.recv().await
		{
			if let Err(e) = tx.send(Message::Text(data)).await {
				println!("Replication to WebSocket encountered an error: {e}");
				println!("Stopping Replication.");
				break;
			};
		}
	}
}
