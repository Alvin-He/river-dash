/*
	Structure guide
	1. Using tokio & axum for the web framework. This lets us set up routing
	2. Using Serde for converting to and from JSON. Lets us (de)serialize data
	3. sqlx lets us interface with our database file
*/

use axum::{
	Json, Router,
	extract::{Path, State},
    middleware::{self,Next},
	http::StatusCode,
	routing::{get, post},
};

use nile_common::comms::stream::{client::StreamClient, raw::StreamEvent};
use sqlx::SqlitePool;

/// So we can let through if on localhost
use std::net::SocketAddr;

/// Cookie use
use tower_http::cors::CorsLayer;
use axum::http::{HeaderValue, Method, header};

mod sql;

mod tasks;

/// Connects to database and opens port for frontend connection
#[tokio::main]
async fn main() {


	let pool = sql::connect().await.expect("database connection failed");

	let database = sql::Database::new(pool);
	database.spawn_session_cleanup();

	/// CORS layer
	let cors = CorsLayer::new()
		.allow_origin("*".parse::<HeaderValue>().unwrap()) // your frontend's exact origin
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
		));

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
