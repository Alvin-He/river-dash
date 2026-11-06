/// Oversees creation of sessions and users, plus checking authentication
/// 
/// Ok admittedly there's a lot in here, it's split into
/// 1. helper methods for the rest of the file
/// 2. Methods that talk to the database
/// 3. Middleware and handler methods
/// 
/// TODO: If I have time I'll break it up into multiple files

use std::{
    net::SocketAddr,
    sync::OnceLock,
    time::{Duration, SystemTime, UNIX_EPOCH},
};
 
/// Hashing algorithms
use argon2::{
    Argon2,
    password_hash::{
        PasswordHash, PasswordHasher, PasswordVerifier, SaltString,
        rand_core::{OsRng, RngCore},
    },
};

/// Standard connection stuff
use axum::{
    Json,
    extract::{ConnectInfo, Request, State},
    http::{HeaderMap, StatusCode, header},
    middleware::Next,
    response::Response,
};

use axum_extra::extract::cookie::{Cookie, CookieJar, SameSite};
use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use serde::Deserialize;
use sha2::{Digest, Sha256};
 
use super::Database;

const SESSION_COOKIE: &str = "session";
const SESSION_LIFETIME_SECS: i64 = 7 * 24 * 60 * 60;

/// ---------------------
/// 1. Some helper functions
/// ---------------------

/// Current system time
fn now_secs() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs() as i64
}
 
fn hash_password(pw: &str) -> Result<String, argon2::password_hash::Error> {
    let salt = SaltString::generate(&mut OsRng);
    Ok(Argon2::default()
        .hash_password(pw.as_bytes(), &salt)?
        .to_string())
}
 
fn verify_password(pw: &str, stored: &str) -> bool {
    PasswordHash::new(stored)
        .map(|h| Argon2::default().verify_password(pw.as_bytes(), &h).is_ok())
        .unwrap_or(false)
}
 
/// Verified against when a username doesn't exist
fn dummy_hash() -> &'static str {
    static HASH: OnceLock<String> = OnceLock::new();
    HASH.get_or_init(|| hash_password("dummy-password-for-timing").expect("dummy hash failed"))
}
 
/// Storing the hash to avoid exploitable data leaks (3201!)
fn hash_token(token: &str) -> String {
    URL_SAFE_NO_PAD.encode(Sha256::digest(token.as_bytes()))
}
 
/// Creating a session token for a user
fn generate_token() -> String {
    let mut bytes = [0u8; 32];
    OsRng.fill_bytes(&mut bytes);
    URL_SAFE_NO_PAD.encode(bytes)
}
 
/// Accepts `Authorization: Bearer <token>` (non-browser clients) or the session cookie.
fn extract_token(headers: &HeaderMap, jar: &CookieJar) -> Option<String> {
    if let Some(t) = headers
        .get(header::AUTHORIZATION)
        .and_then(|v| v.to_str().ok())
        .and_then(|v| v.strip_prefix("Bearer "))
    {
        return Some(t.to_string());
    }
    jar.get(SESSION_COOKIE).map(|c| c.value().to_string())
}
 
fn is_local(addr: &SocketAddr) -> bool {
    // to_canonical handles IPv4-mapped IPv6 addresses like ::ffff:127.0.0.1
    addr.ip().to_canonical().is_loopback()
}
 
fn internal<E: std::fmt::Display>(e: E) -> StatusCode {
    eprintln!("internal error: {e}");
    StatusCode::INTERNAL_SERVER_ERROR
}

/// ------------------------
/// 2. Database-related methods
/// ------------------------

impl Database {
    async fn insert_user(&self, username: &str, password_hash: &str) -> Result<(), sqlx::Error> {
        sqlx::query("INSERT INTO users (username, password_hash) VALUES (?, ?)")
            .bind(username)
            .bind(password_hash)
            .execute(&self.sql_pool)
            .await?;
        Ok(())
    }
 
    /// Returns (user id, stored password hash) if the user exists.
    async fn find_user_credentials(
        &self,
        username: &str,
    ) -> Result<Option<(i64, String)>, sqlx::Error> {
        sqlx::query_as("SELECT id, password_hash FROM users WHERE username = ?")
            .bind(username)
            .fetch_optional(&self.sql_pool)
            .await
    }
 
    async fn insert_session(
        &self,
        password_hash: &str,
        user_id: i64,
        expires_at: i64,
    ) -> Result<(), sqlx::Error> {
        sqlx::query("INSERT INTO users (password_hash, user_id, expires_at) VALUES (?, ?, ?)")
            .bind(password_hash)
            .bind(user_id)
            .bind(expires_at)
            .execute(&self.sql_pool)
            .await?;
        Ok(())
    }
 
    async fn session_is_valid(&self, password_hash: &str) -> Result<bool, sqlx::Error> {
        let row = sqlx::query_scalar::<_, i64>(
            "SELECT 1 FROM users WHERE password_hash = ? AND expires_at > ?",
        )
        .bind(password_hash)
        .bind(now_secs())
        .fetch_optional(&self.sql_pool)
        .await?;
        Ok(row.is_some())
    }
 
    async fn delete_session(&self, password_hash: &str) -> Result<(), sqlx::Error> {
        sqlx::query("DELETE FROM users WHERE password_hash = ?")
            .bind(password_hash)
            .execute(&self.sql_pool)
            .await?;
        Ok(())
    }
 
    async fn purge_expired_sessions(&self) -> Result<(), sqlx::Error> {
        sqlx::query("DELETE FROM users WHERE expires_at <= ?")
            .bind(now_secs())
            .execute(&self.sql_pool)
            .await?;
        Ok(())
    }
 
    /// Spawns a background task that deletes expired sessions hourly.
    pub fn spawn_session_cleanup(&self) {
        let db = self.clone();
        tokio::spawn(async move {
            let mut tick = tokio::time::interval(Duration::from_secs(60 * 60));
            loop {
                tick.tick().await;
                let _ = db.purge_expired_sessions().await;
            }
        });
    }
}

/// -----------------------------------
/// 3. Middleware and handler functions
/// -----------------------------------

#[derive(Deserialize)]
pub struct Credentials {
    username: String,
    password: String,
}
 
impl Database {
    /// Middleware: localhost passes through, everyone else needs a valid session.
    pub async fn require_auth(
        State(db): State<Database>,
        ConnectInfo(addr): ConnectInfo<SocketAddr>,
        jar: CookieJar,
        req: Request,
        next: Next,
    ) -> Result<Response, StatusCode> {
        if is_local(&addr) {
            return Ok(next.run(req).await);
        }
 
        let token = extract_token(req.headers(), &jar).ok_or(StatusCode::UNAUTHORIZED)?;
 
        if db
            .session_is_valid(&hash_token(&token))
            .await
            .map_err(internal)?
        {
            Ok(next.run(req).await)
        } else {
            Err(StatusCode::UNAUTHORIZED)
        }
    }
 
    pub async fn login(
        State(db): State<Database>,
        jar: CookieJar,
        Json(creds): Json<Credentials>,
    ) -> Result<(CookieJar, StatusCode), StatusCode> {
        let found = db
            .find_user_credentials(&creds.username)
            .await
            .map_err(internal)?;
 
        let (user_id, stored_hash) = match found {
            Some((id, hash)) => (Some(id), Some(hash)),
            None => (None, None),
        };
 
        // Argon2 is CPU heavy, so keep it off the async runtime threads.
        // If the user doesn't exist we still verify against a dummy hash.
        let password = creds.password;
        let ok = tokio::task::spawn_blocking(move || {
            let hash = stored_hash.as_deref().unwrap_or_else(|| dummy_hash());
            verify_password(&password, hash)
        })
        .await
        .map_err(internal)?;
 
        let user_id = match (ok, user_id) {
            (true, Some(id)) => id,
            _ => return Err(StatusCode::UNAUTHORIZED),
        };
 
        let token = generate_token();
        db.insert_session(&hash_token(&token), user_id, now_secs() + SESSION_LIFETIME_SECS)
            .await
            .map_err(internal)?;
 
        let cookie = Cookie::build((SESSION_COOKIE, token))
            .http_only(true)
            .same_site(SameSite::Strict)
            .path("/")
            .max_age(time::Duration::seconds(SESSION_LIFETIME_SECS))
            // .secure(true) // enable once you serve over HTTPS
            .build();
 
        Ok((jar.add(cookie), StatusCode::NO_CONTENT))
    }
 
    pub async fn logout(
        State(db): State<Database>,
        jar: CookieJar,
        headers: HeaderMap,
    ) -> Result<(CookieJar, StatusCode), StatusCode> {
        if let Some(token) = extract_token(&headers, &jar) {
            db.delete_session(&hash_token(&token))
                .await
                .map_err(internal)?;
        }
        let removal = Cookie::build((SESSION_COOKIE, "")).path("/").build();
        Ok((jar.remove(removal), StatusCode::NO_CONTENT))
    }
 
    /// Creates a user. Localhost only, which solves the "first user" problem.
    pub async fn setup(
        State(db): State<Database>,
        ConnectInfo(addr): ConnectInfo<SocketAddr>,
        Json(creds): Json<Credentials>,
    ) -> Result<StatusCode, StatusCode> {
        if !is_local(&addr) {
            return Err(StatusCode::FORBIDDEN);
        }
 
        let password = creds.password;
        let hash = tokio::task::spawn_blocking(move || hash_password(&password))
            .await
            .map_err(internal)?
            .map_err(internal)?;
 
        db.insert_user(&creds.username, &hash).await.map_err(|e| {
            if e.as_database_error()
                .map(|d| d.is_unique_violation())
                .unwrap_or(false)
            {
                StatusCode::CONFLICT
            } else {
                StatusCode::INTERNAL_SERVER_ERROR
            }
        })?;
 
        Ok(StatusCode::CREATED)
    }
}
