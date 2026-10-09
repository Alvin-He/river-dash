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
 

struct Component {
    id : String,
	isReadable: bool,
    isCommandable: bool
}

#[derive(Debug, Deserialize, Serialize, Clone)]
struct Configuration {
    name: String,
    components: list[Component]
}

/*
	Data stream API
*/


#[tokio::main]
async fn main() {
    let app = Router::new()
        .route("/", get(|| async { "Hello, World!" }))
        .route("/configs/:id", get(getConfig));
 
    let listener = tokio::net::TcpListener::bind("0.0.0.0:3000").await.unwrap();
    println!("Listening on http://localhost:3000");
    axum::serve(listener, app).await.unwrap();
}


async fn getConfig() {
    
}