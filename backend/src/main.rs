/*
	Structure guide
	1. Using tokio & axum for the web framework. This lets us set up routing
	2. Using Serde for converting to and from JSON. Lets us (de)serialize data
	3. sqlx lets us interface with our database file
*/

use std::sync::Arc;

use axum::{
	Json, Router,
	extract::{Path, State},
	http::StatusCode,
	middleware::{self, Next},
	routing::{any, get, post},
};

use nile_common::comms::stream::{client::StreamClient, raw::StreamEvent};
use sqlx::SqlitePool;
use tokio::task;

/// So we can let through if on localhost
use std::net::SocketAddr;

use axum::http::{HeaderValue, Method, header};
/// Cookie use
use tower_http::cors::CorsLayer;

mod intake;
mod sql;
mod stream;
mod topics;

/// Connects to database and opens port for frontend connection
#[tokio::main]
async fn main() {
	let pool = sql::connect().await.expect("database connection failed");

	let replication_server = stream::replication::ReplicationServer::new();
	let topic_register = Arc::new(std::sync::Mutex::new(topics::TopicRegistry::new(&replication_server)));

	let nile_stand = intake::nile_stand::NileClient::new(
		nile_common::comms::stream::client::StreamClient::connect(
			"127.0.0.1:9090",
		)
		.expect("To be able to connect to nile"),
		topic_register.clone()
	);
	tokio::task::spawn(nile_stand.run_green_thread());

	let database = sql::Database::new(pool);
	database.spawn_session_cleanup();

	/// CORS layer
	let cors = CorsLayer::new()
		.allow_origin("http://127.0.0.1:5173".parse::<HeaderValue>().unwrap()) // your frontend's exact origin
		.allow_methods([Method::GET, Method::POST, Method::DELETE])
		.allow_headers([header::CONTENT_TYPE, header::AUTHORIZATION])
		.allow_credentials(true);

	/// Inner routes after authentication
	let protected = Router::new()
		.route(
			"/configs",
			get(sql::Database::get_configs).post(sql::Database::post_config),
		)
		.route(
			"/configs/{name}",
			get(sql::Database::get_config).delete(sql::Database::delete_config),
		)
		.route_layer(middleware::from_fn_with_state(
			database.clone(),
			sql::Database::require_auth,
		))
		.route(
			"/stream/ws",
			any(async move |ws| {
				stream::StreamProcessor::new(&replication_server.clone())
					.ws_handler(ws)
					.await
			}),
		);

	// Showing callable routes
	let app = Router::new()
		.route("/", get(|| async { "Hello, World!" }))
		.route("/login", post(sql::Database::login))
		.route("/logout", post(sql::Database::logout))
		.route("/setup", post(sql::Database::setup))
		.merge(protected)
		.layer(cors)
		.with_state(database);

	// Listen for a client
	let listener = tokio::net::TcpListener::bind("0.0.0.0:3000").await.unwrap();
	println!("Listening on http://localhost:3000");

	/// Serve AND see client's address
	axum::serve(
		listener,
		app.into_make_service_with_connect_info::<SocketAddr>(),
	)
	.await
	.unwrap();
}
