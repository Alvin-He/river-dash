/*
	Structure guide
	1. Using tokio & axum for the web framework. This lets us set up routing
	2. Using Serde for converting to and from JSON. Lets us (de)serialize data
	3. sqlx lets us interface with our database file
*/

use std::{
	sync::Arc,
	time::{SystemTime, UNIX_EPOCH},
};

use axum::{
	Json, Router,
	extract::{Path, State},
	http::StatusCode,
	middleware::{self, Next},
	routing::{any, get, post},
};

use nile_common::log;
use nile_common::{
	comms::stream::{client::StreamClient, raw::StreamEvent},
	log::Severity,
};

use tokio::task;

/// So we can let through if on localhost
use std::net::SocketAddr;

use axum::http::{HeaderValue, Method, header};
/// Cookie use
use tower_http::cors::CorsLayer;

mod sql;
mod intake;
mod stream;
mod topics;

/// default listen addr
pub const BACKEND_DEFAULT_ADDR: &'static str = "0.0.0.0:9090";
/// default number of slots per channel
pub const BROADCAST_CHANNEL_SIZE: usize = 1028;

// Log setup as seen in nile_common::log
pub const LOG_TAG: &'static str = "Backend";
static FILE_TARGET: log::FileTarget<String> = log::FileTarget::new(|| {
	let now: std::time::Duration = SystemTime::now()
		.duration_since(UNIX_EPOCH)
		.expect("Time to be greater than UNIX_EPOCH.");
	format!("log/log_{}.log", now.as_secs())
});

static TERM_TARGET: log::TargetFilter<log::TerminalTarget> =
	log::TargetFilter::new(log::Severity::Info, log::TerminalTarget);

static TARGET: log::CompoundTarget<'_> = log::compile(
	&FILE_TARGET as &dyn log::Target,
	&TERM_TARGET as &dyn log::Target,
);


// Connects to database and opens port for frontend connection
#[tokio::main]
async fn main() {
	// TODO: Find permanent space where logs will live
	if let Err(e) = std::fs::create_dir_all("log") {
		eprintln!("Failed to create log directory: {e}");
		std::process::exit(1);
	}

	// Set up logging, other operations will be able to see
	log::set_global_target(&TARGET);
	nile_common::info!(LOG_TAG, "Backend starting");

	let pool = match sql::connect().await {
		Ok(pool) => pool,
		Err(e) => {
			nile_common::critical!(
				LOG_TAG,
				"Database connection failed: {}",
				e
			);
			std::process::exit(1);
		}
	};
	nile_common::info!(LOG_TAG, "Database connected");

	let replication_server = stream::replication::ReplicationServer::new();
	let topic_register = topics::TopicRegistry::new(&replication_server);

	let nile_stand = intake::nile_stand::NileClient::new(
		nile_common::comms::stream::client::StreamClient::connect(
			"127.0.0.1:8369",
		)
		.expect("Unable to connect to nile"),
		topic_register.clone(),
	);
	nile_stand.run_full_thread();

	let database = sql::Database::new(pool);
	database.spawn_session_cleanup();

	// CORS layer
	let cors = CorsLayer::new()
		.allow_origin("http://127.0.0.1:5173".parse::<HeaderValue>().unwrap()) // your frontend's exact origin
		.allow_methods([Method::GET, Method::POST, Method::DELETE])
		.allow_headers([header::CONTENT_TYPE, header::AUTHORIZATION])
		.allow_credentials(true);


	// Inner routes after authentication
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
	let listener = tokio::net::TcpListener::bind(BACKEND_DEFAULT_ADDR)
		.await
		.unwrap();
	log!(
		Severity::Info,
		LOG_TAG,
		"Listening on http://{BACKEND_DEFAULT_ADDR}"
	);

	// Serve AND see client's address
	axum::serve(
		listener,
		app.into_make_service_with_connect_info::<SocketAddr>(),
	)
	.await
	.unwrap();
}
