pub mod replication;
pub mod schema;
use axum::{
	extract::{
		WebSocketUpgrade,
		ws::{self, WebSocket},
	},
	response::{IntoResponse, Response},
};
use futures_util::{Sink, Stream, StreamExt};

use crate::{
	stream::{
		replication::{
			ReplicationNode, ReplicationServer, WebsocketReplicationNode,
		},
	},
};

pub struct StreamProcessor {
	rc_server: ReplicationServer,
}

impl StreamProcessor {
	pub fn new(
		rc_server: &ReplicationServer,
	) -> StreamProcessor {
		StreamProcessor {
			rc_server: rc_server.clone(),
		}
	}

	pub async fn ws_handler(self, ws: WebSocketUpgrade) -> impl IntoResponse {
		let rc_server = self.rc_server.clone();
		ws.protocols(["RiverDash.pubsub.v1"])
			.on_failed_upgrade(|e| {
				println!("Failed to upgrade: {e}");
			})
			.on_upgrade(async move |w| {
				println!("Got WS Connection");
				WebsocketReplicationNode::new(w).replicate_to(&rc_server)
			})
	}
}
