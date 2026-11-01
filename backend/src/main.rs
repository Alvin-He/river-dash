/*
	Structure guide
	1. Using tokio & axum for the web framework. This lets us set up routing
	2. Using Serde for converting to and from JSON. Lets us (de)serialize data
	3. sqlx lets us interface with our database file
*/

use axum::{
	Json, Router,
	extract::{Path, State},
	http::StatusCode,
	routing::{get, post},
};

use nile_common::comms::stream::{client::StreamClient, raw::StreamEvent};
use sqlx::SqlitePool;

mod sql;

mod tasks;

/// Connects to database and opens port for frontend connection
#[tokio::main]
async fn main() {
	let pool = sql::connect().await.expect("database connection failed");

	let app = Router::new()
		.route("/", get(|| async { "Hello, World!" }))
		.route("/configs", get(get_configs).post(post_config))
		.route("/configs/{name}", get(get_config).delete(delete_config))
		.with_state(AppState { db: pool });

	let listener = tokio::net::TcpListener::bind("0.0.0.0:3000").await.unwrap();

	println!("Listening on http://localhost:3000");
	axum::serve(listener, app).await.unwrap();
}

async fn get_configs(State(state): State<AppState>) -> Result<Json<Vec<sql::Config>>, StatusCode> {
	return sql::get_all_configs(&state.db)
		.await
		.map(Json)
		.map_err(|e| {
			eprintln!("get_configs has failed: {e}");
			StatusCode::INTERNAL_SERVER_ERROR
		});
}
async fn get_config(
	State(state): State<AppState>,
	Path(name): Path<String>,
) -> Result<Json<sql::Config>, StatusCode> {
	match sql::get_config(&state.db, name).await {
		Ok(Some(config)) => Ok(Json(config)),
		Ok(None) => Err(StatusCode::NOT_FOUND),
		Err(e) => {
			eprintln!("get_config has failed: {e}");
			Err(StatusCode::INTERNAL_SERVER_ERROR)
		}
	}
}

async fn post_config(
	State(state): State<AppState>,
	Json(config): Json<sql::Config>,
) -> Result<Json<sql::Config>, StatusCode> {
	sql::upsert_config(&state.db, &config)
		.await
		.map(|_| Json(config))
		.map_err(|e| {
			eprintln!("post_config has failed: {e}");
			StatusCode::INTERNAL_SERVER_ERROR
		})
}

async fn delete_config(State(state): State<AppState>, Path(name): Path<String>) -> StatusCode {
	match sql::delete_config(&state.db, &name).await {
		Ok(true) => StatusCode::NO_CONTENT,
		Ok(false) => StatusCode::NOT_FOUND,
		Err(e) => {
			eprintln!("delete_config has failed: {e}");
			StatusCode::INTERNAL_SERVER_ERROR
		}
	}
}
