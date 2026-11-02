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


mod sql;



/// Connects to database and opens port for frontend connection
#[tokio::main]
async fn main() {
    // Initial Sqlite connection
    let pool = sql::connect()
        .await.expect("database connection failed");

    let database = sql::Database::new(pool);

    // List of usable routes
    let app = Router::new()
        .route("/", get(|| async { "Hello, World!" }))
        .route("/configs", 
        get(sql::Database::get_configs)
                .post(sql::Database::post_config)
            )
        .route("/configs/{name}", 
                get(sql::Database::get_config)
                .delete(sql::Database::delete_config)
            )
        .with_state( database );
    
    // Listen for a client
    let listener = tokio::net::TcpListener::bind("0.0.0.0:3000")
        .await.unwrap();
    println!("Listening on http://localhost:3000");
    axum::serve(listener, app).await.unwrap();
}
