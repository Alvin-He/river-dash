/*
	Structure guide
	1. Using tokio & axum for the web framework. This lets us set up routing
	2. Using Serde for converting to and from JSON. Lets us (de)serialize data
*/

use axum::{
    extract::{Path, State},
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;

mod sql;
 
 #[derive(Clone)]
struct AppState {
    db: SqlitePool,
}

#[derive(Debug, Serialize, FromRow)]
pub struct Config {
    pub id: String,
    pub components: String
}
/*
	Data stream API
*/


#[tokio::main]
async fn main() {
    let app = Router::new()
        .route("/", get(|| async { "Hello, World!" }))
        .route("/configs/:id", get(get_config))
        .route("/configs", get(get_configs));
    
    let pool = db::connect()
        .await.expect("database connection failed");
 
    let listener = tokio::net::TcpListener::bind("0.0.0.0:3000")
        .await.unwrap();
    
    println!("Listening on http://localhost:3000");
    axum::serve(listener, app).await.unwrap();
}


async fn get_configs() {
    
}
async fn get_config() {
    
}