/*
	Structure guide
	1. Using tokio & axum for the web framework. This lets us set up routing
	2. Using Serde for converting to and from JSON. Lets us (de)serialize data
*/

use axum::{
    extract::{Path, State},
    routing::{get, post},
    Json, Router,
    http::StatusCode,
};

use sqlx::SqlitePool;

mod sql;
 
 #[derive(Clone)]
struct AppState {
    db: SqlitePool,
}

/*
	Data stream API
*/


#[tokio::main]
async fn main() {
    let pool = sql::connect()
        .await.expect("database connection failed");

    let app = Router::new()
        .route("/", get(|| async { "Hello, World!" }))
        .route("/configs/{name}", get(get_config))
        .route("/configs", get(get_configs))
        .with_state( AppState { db : pool} );
    
 
    let listener = tokio::net::TcpListener::bind("0.0.0.0:3000")
        .await.unwrap();

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