pub mod replication;
mod schema;
pub mod topic_registry;
use axum::{
	extract::{
		WebSocketUpgrade,
		ws::{self, WebSocket},
	},
	response::{IntoResponse, Response},
};
use futures_util::{Sink, Stream, StreamExt};

use crate::{
	data_stream::{
		replication::{
			ReplicationNode, ReplicationServer, WebsocketReplicationNode,
		},
		topic_registry::TopicRegistry,
	},
	tasks::nile_client_receive,
};

pub struct StreamProcessor {
	value_receiver: nile_client_receive::ReceiverValueStream,
	log_receiver: nile_client_receive::ReceiverMessageStream,
	rc_server: ReplicationServer,
}

impl StreamProcessor {
	pub fn new(
		nile_client: &nile_client_receive::NileClient,
		rc_server: &ReplicationServer,
	) -> StreamProcessor {
		StreamProcessor {
			value_receiver: nile_client.get_stream_values(),
			log_receiver: nile_client.get_stream_messages(),
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
				WebsocketReplicationNode::new(w).replicate_to(&rc_server)
			})
	}
}
