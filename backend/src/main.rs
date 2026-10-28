/*
	Structure guide
	1. Using tokio & axum for the web framework. This lets us set up routing
	2. Using Serde for converting to and from JSON. Lets us (de)serialize data
    3. sqlx lets us interface with our database file
*/

use axum::{
    extract::{Path, State},
    routing::{get, post},
    Json, Router,
    http::StatusCode,
};

use sqlx::SqlitePool;

mod sql;
 
 /// Connection to the app's persistent state
 #[derive(Clone)]
struct AppState {
    db: SqlitePool,
}


/// Connects to database and opens port for frontend connection
#[tokio::main]
async fn main() {
    // Initial Sqlite connection
    let pool = sql::connect()
        .await.expect("database connection failed");

    // List of usable routes
    let app = Router::new()
        .route("/", get(|| async { "Hello, World!" }))
        .route("/configs", get(get_configs).post(post_config))
        .route("/configs/{name}", get(get_config).delete(delete_config))
        .with_state( AppState { db : pool} );
    
    // Connection Setup
    let listener = tokio::net::TcpListener::bind("0.0.0.0:3000")
        .await.unwrap();
    println!("Listening on http://localhost:3000");
    axum::serve(listener, app).await.unwrap();
}


/// TODO: Move all these into sql and make them functions of AppState

/// Get all Config objects from configs
async fn get_configs(State(state): State<AppState>) -> Result<Json<Vec<sql::Config>>, StatusCode> {
    return sql::get_all_configs(&state.db)
        .await
        .map(Json)
        .map_err(|e| {
            eprintln!("get_configs has failed: {e}");
            StatusCode::INTERNAL_SERVER_ERROR
        });
}

/// Load a specific Config object from configs
async fn get_config(
    State(state): State<AppState>,
    Path(name): Path<String>,
)-> Result<Json<sql::Config>, StatusCode> {
    match sql::get_config(&state.db, name).await {
        Ok(Some(config)) => Ok(Json(config)),
        Ok(None) => Err(StatusCode::NOT_FOUND),
        Err(e) => {
            eprintln!("get_config has failed: {e}");
            Err(StatusCode::INTERNAL_SERVER_ERROR)
        }
    }
}

/// Add a new uniquely named configuration to configs
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

/// Remove a configuration from configs by name
async fn delete_config(
    State(state): State<AppState>,
    Path(name): Path<String>,
) -> StatusCode {
    match sql::delete_config(&state.db, &name).await {
        Ok(true) => StatusCode::NO_CONTENT,
        Ok(false) => StatusCode::NOT_FOUND,
        Err(e) => {
            eprintln!("delete_config has failed: {e}");
            StatusCode::INTERNAL_SERVER_ERROR
        }
    }
}