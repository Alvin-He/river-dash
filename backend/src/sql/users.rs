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
 
fn internal<E>(_: E) -> StatusCode {
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
        token_hash: &str,
        user_id: i64,
        expires_at: i64,
    ) -> Result<(), sqlx::Error> {
        sqlx::query("INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)")
            .bind(token_hash)
            .bind(user_id)
            .bind(expires_at)
            .execute(&self.sql_pool)
            .await?;
        Ok(())
    }
 
    async fn session_is_valid(&self, token_hash: &str) -> Result<bool, sqlx::Error> {
        let row = sqlx::query_scalar::<_, i64>(
            "SELECT 1 FROM sessions WHERE token_hash = ? AND expires_at > ?",
        )
        .bind(token_hash)
        .bind(now_secs())
        .fetch_optional(&self.sql_pool)
        .await?;
        Ok(row.is_some())
    }
 
    async fn delete_session(&self, token_hash: &str) -> Result<(), sqlx::Error> {
        sqlx::query("DELETE FROM sessions WHERE token_hash = ?")
            .bind(token_hash)
            .execute(&self.sql_pool)
            .await?;
        Ok(())
    }
 
    async fn purge_expired_sessions(&self) -> Result<(), sqlx::Error> {
        sqlx::query("DELETE FROM sessions WHERE expires_at <= ?")
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
            .http_only(false)   // Currently this & https unsupported
            .same_site(SameSite::Lax) // Currently FE & BE can be on different sites. If that changes, tighten to Strict or Lax
            .path("/")
            .max_age(time::Duration::seconds(SESSION_LIFETIME_SECS))
            .secure(false)
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


#[cfg(test)]
mod tests {
    use super::*;
    use axum::{Router, http::HeaderValue, middleware, routing::get};
    use sqlx::{SqlitePool, sqlite::SqlitePoolOptions};
    use tower::ServiceExt; // for `oneshot`

    const LOCAL: &str = "127.0.0.1:4000";
    const REMOTE: &str = "203.0.113.7:4000";

    // ---------- setup helpers ----------

    async fn setup_pool() -> SqlitePool {
        let pool = SqlitePoolOptions::new()
            .max_connections(1) // each `sqlite::memory:` connection is its own DB
            .connect("sqlite::memory:")
            .await
            .expect("failed to open in-memory sqlite");

        sqlx::query(
            "CREATE TABLE users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                username TEXT NOT NULL UNIQUE,
                password_hash TEXT NOT NULL
            )",
        )
        .execute(&pool)
        .await
        .unwrap();

        sqlx::query(
            "CREATE TABLE sessions (
                token_hash TEXT PRIMARY KEY NOT NULL,
                user_id INTEGER NOT NULL,
                expires_at INTEGER NOT NULL
            )",
        )
        .execute(&pool)
        .await
        .unwrap();

        pool
    }

    async fn setup_db() -> Database {
        Database::new(setup_pool().await)
    }

    /// Verify failure if pool is closed
    async fn broken_db() -> Database {
        let pool = setup_pool().await;
        pool.close().await;
        Database::new(pool)
    }

    fn addr(s: &str) -> SocketAddr {
        s.parse().unwrap()
    }

    fn creds(u: &str, p: &str) -> Credentials {
        Credentials {
            username: u.to_string(),
            password: p.to_string(),
        }
    }

    /// Inserts a user directly and returns its id.
    async fn seed_user(db: &Database, username: &str, password: &str) -> i64 {
        let hash = hash_password(password).unwrap();
        db.insert_user(username, &hash).await.unwrap();
        db.find_user_credentials(username).await.unwrap().unwrap().0
    }

    async fn count_sessions(db: &Database) -> i64 {
        sqlx::query_scalar::<_, i64>("SELECT COUNT(*) FROM sessions")
            .fetch_one(&db.sql_pool)
            .await
            .unwrap()
    }

    // ---------- 1. helpers ----------

    #[test]
    fn now_secs_is_a_plausible_unix_timestamp() {
        assert!(now_secs() > 1_700_000_000);
    }

    #[test]
    fn hash_password_verifies_with_correct_password() {
        let h = hash_password("hunter2").unwrap();
        assert!(verify_password("hunter2", &h));
    }

    #[test]
    fn verify_password_rejects_wrong_password() {
        let h = hash_password("hunter2").unwrap();
        assert!(!verify_password("hunter3", &h));
        assert!(!verify_password("", &h));
    }

    #[test]
    fn hash_password_is_salted_and_not_plaintext() {
        let a = hash_password("same").unwrap();
        let b = hash_password("same").unwrap();
        assert_ne!(a, b, "same password must produce different hashes");
        assert!(!a.contains("same"));
        assert!(a.starts_with("$argon2"));
    }

    #[test]
    fn verify_password_returns_false_for_malformed_stored_hash() {
        assert!(!verify_password("pw", "not a phc string"));
        assert!(!verify_password("pw", ""));
    }

    #[test]
    fn dummy_hash_is_valid_and_cached() {
        assert!(PasswordHash::new(dummy_hash()).is_ok());
        assert!(std::ptr::eq(dummy_hash(), dummy_hash()));
        assert!(!verify_password("anything-else", dummy_hash()));
    }

    #[test]
    fn hash_token_is_deterministic_and_url_safe() {
        let a = hash_token("my-token");
        assert_eq!(a, hash_token("my-token"));
        assert_ne!(a, hash_token("my-token2"));
        assert_eq!(a.len(), 43); // SHA-256 = 32 bytes -> 43 base64 chars, no padding
        assert!(!a.contains(['+', '/', '=']));
        assert!(!a.contains("my-token"));
    }

    #[test]
    fn generate_token_is_long_unique_and_url_safe() {
        let a = generate_token();
        let b = generate_token();
        assert_ne!(a, b);
        assert_eq!(a.len(), 43); // 32 random bytes
        assert!(a.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_'));
    }

    #[test]
    fn extract_token_reads_bearer_header() {
        let mut h = HeaderMap::new();
        h.insert(header::AUTHORIZATION, HeaderValue::from_static("Bearer abc123"));
        assert_eq!(extract_token(&h, &CookieJar::new()), Some("abc123".into()));
    }

    #[test]
    fn extract_token_reads_session_cookie() {
        let jar = CookieJar::new().add(Cookie::new(SESSION_COOKIE, "cookie-tok"));
        assert_eq!(extract_token(&HeaderMap::new(), &jar), Some("cookie-tok".into()));
    }

    #[test]
    fn extract_token_prefers_header_over_cookie() {
        let mut h = HeaderMap::new();
        h.insert(header::AUTHORIZATION, HeaderValue::from_static("Bearer from-header"));
        let jar = CookieJar::new().add(Cookie::new(SESSION_COOKIE, "from-cookie"));
        assert_eq!(extract_token(&h, &jar), Some("from-header".into()));
    }

    #[test]
    fn extract_token_ignores_non_bearer_schemes() {
        let mut h = HeaderMap::new();
        h.insert(header::AUTHORIZATION, HeaderValue::from_static("Basic dXNlcjpwdw=="));
        assert_eq!(extract_token(&h, &CookieJar::new()), None);

        // falls back to the cookie if there is one
        let jar = CookieJar::new().add(Cookie::new(SESSION_COOKIE, "fallback"));
        assert_eq!(extract_token(&h, &jar), Some("fallback".into()));
    }

    #[test]
    fn extract_token_is_case_sensitive_on_bearer_prefix() {
        let mut h = HeaderMap::new();
        h.insert(header::AUTHORIZATION, HeaderValue::from_static("bearer abc"));
        assert_eq!(extract_token(&h, &CookieJar::new()), None);
    }

    #[test]
    fn extract_token_none_when_nothing_present() {
        assert_eq!(extract_token(&HeaderMap::new(), &CookieJar::new()), None);
    }

    #[test]
    fn is_local_accepts_loopback_addresses() {
        assert!(is_local(&addr("127.0.0.1:80")));
        assert!(is_local(&addr("127.1.2.3:80")));
        assert!(is_local(&addr("[::1]:80")));
        assert!(is_local(&addr("[::ffff:127.0.0.1]:80"))); // IPv4-mapped
    }

    #[test]
    fn is_local_rejects_non_loopback_addresses() {
        assert!(!is_local(&addr("192.168.1.10:80")));
        assert!(!is_local(&addr("8.8.8.8:80")));
        assert!(!is_local(&addr("0.0.0.0:80")));
        assert!(!is_local(&addr("[2001:db8::1]:80")));
        assert!(!is_local(&addr("[::ffff:192.168.1.10]:80")));
    }

    #[test]
    fn internal_maps_any_error_to_500() {
        assert_eq!(internal("anything"), StatusCode::INTERNAL_SERVER_ERROR);
    }

    // ---------- 2. database methods ----------

    #[tokio::test]
    async fn insert_and_find_user_roundtrip() {
        let db = setup_db().await;
        db.insert_user("alice", "hash-value").await.unwrap();

        let (id, hash) = db.find_user_credentials("alice").await.unwrap().unwrap();
        assert!(id > 0);
        assert_eq!(hash, "hash-value");
    }

    #[tokio::test]
    async fn find_user_credentials_none_for_unknown_user() {
        let db = setup_db().await;
        assert!(db.find_user_credentials("ghost").await.unwrap().is_none());
    }

    #[tokio::test]
    async fn find_user_credentials_is_case_sensitive() {
        let db = setup_db().await;
        db.insert_user("Alice", "h").await.unwrap();
        assert!(db.find_user_credentials("alice").await.unwrap().is_none());
    }

    #[tokio::test]
    async fn insert_user_duplicate_is_unique_violation() {
        let db = setup_db().await;
        db.insert_user("bob", "h1").await.unwrap();
        let err = db.insert_user("bob", "h2").await.unwrap_err();
        assert!(err.as_database_error().unwrap().is_unique_violation());
    }

    #[tokio::test]
    async fn find_user_treats_sql_metacharacters_as_data() {
        let db = setup_db().await;
        db.insert_user("real", "h").await.unwrap();
        assert!(db
            .find_user_credentials("' OR '1'='1")
            .await
            .unwrap()
            .is_none());
    }

    #[tokio::test]
    async fn session_is_valid_for_unexpired_session() {
        let db = setup_db().await;
        db.insert_session("th", 1, now_secs() + 60).await.unwrap();
        assert!(db.session_is_valid("th").await.unwrap());
    }

    #[tokio::test]
    async fn session_is_invalid_when_expired() {
        let db = setup_db().await;
        db.insert_session("th", 1, now_secs() - 1).await.unwrap();
        assert!(!db.session_is_valid("th").await.unwrap());
    }

    #[tokio::test]
    async fn session_is_invalid_when_unknown() {
        let db = setup_db().await;
        assert!(!db.session_is_valid("nope").await.unwrap());
    }

    #[tokio::test]
    async fn insert_session_duplicate_token_hash_errors() {
        let db = setup_db().await;
        db.insert_session("dup", 1, now_secs() + 60).await.unwrap();
        assert!(db.insert_session("dup", 2, now_secs() + 60).await.is_err());
    }

    #[tokio::test]
    async fn delete_session_removes_only_that_session() {
        let db = setup_db().await;
        db.insert_session("a", 1, now_secs() + 60).await.unwrap();
        db.insert_session("b", 1, now_secs() + 60).await.unwrap();

        db.delete_session("a").await.unwrap();

        assert!(!db.session_is_valid("a").await.unwrap());
        assert!(db.session_is_valid("b").await.unwrap());
    }

    #[tokio::test]
    async fn delete_session_missing_is_ok() {
        let db = setup_db().await;
        assert!(db.delete_session("never-existed").await.is_ok());
    }

    #[tokio::test]
    async fn purge_expired_sessions_removes_only_expired() {
        let db = setup_db().await;
        db.insert_session("old1", 1, now_secs() - 100).await.unwrap();
        db.insert_session("old2", 1, now_secs() - 1).await.unwrap();
        db.insert_session("fresh", 1, now_secs() + 100).await.unwrap();

        db.purge_expired_sessions().await.unwrap();

        assert_eq!(count_sessions(&db).await, 1);
        assert!(db.session_is_valid("fresh").await.unwrap());
    }

    #[tokio::test]
    async fn spawn_session_cleanup_purges_on_first_tick() {
        let db = setup_db().await;
        db.insert_session("old", 1, now_secs() - 100).await.unwrap();
        db.insert_session("fresh", 1, now_secs() + 100).await.unwrap();

        db.spawn_session_cleanup(); // interval's first tick fires immediately

        // poll rather than sleep a fixed time
        for _ in 0..40 {
            if count_sessions(&db).await == 1 {
                break;
            }
            tokio::time::sleep(Duration::from_millis(50)).await;
        }
        assert_eq!(count_sessions(&db).await, 1);
        assert!(db.session_is_valid("fresh").await.unwrap());
    }

    #[tokio::test]
    async fn db_methods_error_on_closed_pool() {
        let db = broken_db().await;
        assert!(db.insert_user("u", "h").await.is_err());
        assert!(db.find_user_credentials("u").await.is_err());
        assert!(db.insert_session("t", 1, 0).await.is_err());
        assert!(db.session_is_valid("t").await.is_err());
        assert!(db.delete_session("t").await.is_err());
        assert!(db.purge_expired_sessions().await.is_err());
    }

    // ---------- 3a. setup handler ----------

    #[tokio::test]
    async fn setup_from_localhost_creates_user_with_hashed_password() {
        let db = setup_db().await;
        let status = Database::setup(
            State(db.clone()),
            ConnectInfo(addr(LOCAL)),
            Json(creds("admin", "s3cret")),
        )
        .await
        .unwrap();
        assert_eq!(status, StatusCode::CREATED);

        let (_, stored) = db.find_user_credentials("admin").await.unwrap().unwrap();
        assert_ne!(stored, "s3cret");
        assert!(verify_password("s3cret", &stored));
    }

    #[tokio::test]
    async fn setup_from_remote_is_forbidden_and_creates_nothing() {
        let db = setup_db().await;
        let result = Database::setup(
            State(db.clone()),
            ConnectInfo(addr(REMOTE)),
            Json(creds("admin", "pw")),
        )
        .await;

        assert_eq!(result.err(), Some(StatusCode::FORBIDDEN));
        assert!(db.find_user_credentials("admin").await.unwrap().is_none());
    }

    #[tokio::test]
    async fn setup_duplicate_username_is_conflict() {
        let db = setup_db().await;
        seed_user(&db, "admin", "pw").await;

        let result = Database::setup(
            State(db),
            ConnectInfo(addr(LOCAL)),
            Json(creds("admin", "other")),
        )
        .await;
        assert_eq!(result.err(), Some(StatusCode::CONFLICT));
    }

    #[tokio::test]
    async fn setup_returns_500_on_db_error() {
        let db = broken_db().await;
        let result = Database::setup(
            State(db),
            ConnectInfo(addr(LOCAL)),
            Json(creds("admin", "pw")),
        )
        .await;
        assert_eq!(result.err(), Some(StatusCode::INTERNAL_SERVER_ERROR));
    }

    // ---------- 3b. login handler ----------

    #[tokio::test]
    async fn login_success_sets_cookie_and_stores_hashed_session() {
        let db = setup_db().await;
        let user_id = seed_user(&db, "alice", "correct-horse").await;

        let (jar, status) = Database::login(
            State(db.clone()),
            CookieJar::new(),
            Json(creds("alice", "correct-horse")),
        )
        .await
        .unwrap();

        assert_eq!(status, StatusCode::NO_CONTENT);

        let cookie = jar.get(SESSION_COOKIE).expect("session cookie should be set");
        let token = cookie.value();
        assert_eq!(token.len(), 43);
        assert_eq!(cookie.path(), Some("/"));
        assert_eq!(
            cookie.max_age(),
            Some(time::Duration::seconds(SESSION_LIFETIME_SECS))
        );

        // Only the hash of the token is stored, never the token itself
        let row: (String, i64, i64) =
            sqlx::query_as("SELECT token_hash, user_id, expires_at FROM sessions")
                .fetch_one(&db.sql_pool)
                .await
                .unwrap();
        assert_eq!(row.0, hash_token(token));
        assert_ne!(row.0, token);
        assert_eq!(row.1, user_id);

        let expected = now_secs() + SESSION_LIFETIME_SECS;
        assert!((row.2 - expected).abs() <= 10, "expiry should be ~7 days out");

        assert!(db.session_is_valid(&hash_token(token)).await.unwrap());
    }

    #[tokio::test]
    async fn login_wrong_password_is_unauthorized_and_creates_no_session() {
        let db = setup_db().await;
        seed_user(&db, "alice", "right").await;

        let result = Database::login(
            State(db.clone()),
            CookieJar::new(),
            Json(creds("alice", "wrong")),
        )
        .await;

        assert_eq!(result.err(), Some(StatusCode::UNAUTHORIZED));
        assert_eq!(count_sessions(&db).await, 0);
    }

    #[tokio::test]
    async fn login_unknown_user_is_unauthorized_and_creates_no_session() {
        let db = setup_db().await;

        let result = Database::login(
            State(db.clone()),
            CookieJar::new(),
            Json(creds("ghost", "whatever")),
        )
        .await;

        assert_eq!(result.err(), Some(StatusCode::UNAUTHORIZED));
        assert_eq!(count_sessions(&db).await, 0);
    }

    #[tokio::test]
    async fn login_twice_creates_two_distinct_sessions() {
        let db = setup_db().await;
        seed_user(&db, "alice", "pw").await;

        let (j1, _) = Database::login(State(db.clone()), CookieJar::new(), Json(creds("alice", "pw")))
            .await
            .unwrap();
        let (j2, _) = Database::login(State(db.clone()), CookieJar::new(), Json(creds("alice", "pw")))
            .await
            .unwrap();

        assert_ne!(
            j1.get(SESSION_COOKIE).unwrap().value(),
            j2.get(SESSION_COOKIE).unwrap().value()
        );
        assert_eq!(count_sessions(&db).await, 2);
    }

    #[tokio::test]
    async fn login_returns_500_on_db_error() {
        let db = broken_db().await;
        let result = Database::login(State(db), CookieJar::new(), Json(creds("a", "b"))).await;
        assert_eq!(result.err(), Some(StatusCode::INTERNAL_SERVER_ERROR));
    }

    // ---------- 3c. logout handler ----------

    #[tokio::test]
    async fn logout_with_cookie_deletes_session_and_clears_cookie() {
        let db = setup_db().await;
        let token = generate_token();
        db.insert_session(&hash_token(&token), 1, now_secs() + 60).await.unwrap();

        let jar = CookieJar::new().add(Cookie::new(SESSION_COOKIE, token.clone()));
        let (jar, status) = Database::logout(State(db.clone()), jar, HeaderMap::new())
            .await
            .unwrap();

        assert_eq!(status, StatusCode::NO_CONTENT);
        assert!(!db.session_is_valid(&hash_token(&token)).await.unwrap());
        assert!(jar.get(SESSION_COOKIE).is_none());
    }

    #[tokio::test]
    async fn logout_with_bearer_header_deletes_session() {
        let db = setup_db().await;
        let token = generate_token();
        db.insert_session(&hash_token(&token), 1, now_secs() + 60).await.unwrap();

        let mut headers = HeaderMap::new();
        headers.insert(
            header::AUTHORIZATION,
            HeaderValue::from_str(&format!("Bearer {token}")).unwrap(),
        );
        let (_, status) = Database::logout(State(db.clone()), CookieJar::new(), headers)
            .await
            .unwrap();

        assert_eq!(status, StatusCode::NO_CONTENT);
        assert!(!db.session_is_valid(&hash_token(&token)).await.unwrap());
    }

    #[tokio::test]
    async fn logout_without_token_still_returns_204() {
        let db = setup_db().await;
        let (_, status) = Database::logout(State(db), CookieJar::new(), HeaderMap::new())
            .await
            .unwrap();
        assert_eq!(status, StatusCode::NO_CONTENT);
    }

    #[tokio::test]
    async fn logout_leaves_other_sessions_alone() {
        let db = setup_db().await;
        let mine = generate_token();
        let other = generate_token();
        db.insert_session(&hash_token(&mine), 1, now_secs() + 60).await.unwrap();
        db.insert_session(&hash_token(&other), 1, now_secs() + 60).await.unwrap();

        let jar = CookieJar::new().add(Cookie::new(SESSION_COOKIE, mine));
        Database::logout(State(db.clone()), jar, HeaderMap::new()).await.unwrap();

        assert!(db.session_is_valid(&hash_token(&other)).await.unwrap());
        assert_eq!(count_sessions(&db).await, 1);
    }

    #[tokio::test]
    async fn logout_returns_500_on_db_error() {
        let db = broken_db().await;
        let jar = CookieJar::new().add(Cookie::new(SESSION_COOKIE, "tok"));
        let result = Database::logout(State(db), jar, HeaderMap::new()).await;
        assert_eq!(result.err(), Some(StatusCode::INTERNAL_SERVER_ERROR));
    }

    // ---------- 3d. require_auth middleware (via a real Router) ----------

    fn protected_app(db: Database) -> Router {
        Router::new()
            .route("/protected", get(|| async { "ok" }))
            .layer(middleware::from_fn_with_state(db, Database::require_auth))
    }

    /// Sends GET /protected as if from `peer`, optionally with a Bearer header and/or session cookie.
    async fn call(
        app: Router,
        peer: &str,
        bearer: Option<&str>,
        cookie: Option<&str>,
    ) -> StatusCode {
        let mut b = Request::builder().uri("/protected");
        if let Some(t) = bearer {
            b = b.header(header::AUTHORIZATION, format!("Bearer {t}"));
        }
        if let Some(t) = cookie {
            b = b.header(header::COOKIE, format!("{SESSION_COOKIE}={t}"));
        }
        let mut req = b.body(axum::body::Body::empty()).unwrap();
        req.extensions_mut().insert(ConnectInfo(addr(peer)));

        app.oneshot(req).await.unwrap().status()
    }

    async fn db_with_session(token: &str) -> Database {
        let db = setup_db().await;
        db.insert_session(&hash_token(token), 1, now_secs() + 60).await.unwrap();
        db
    }

    #[tokio::test]
    async fn require_auth_lets_localhost_through_without_credentials() {
        let db = setup_db().await;
        assert_eq!(call(protected_app(db), LOCAL, None, None).await, StatusCode::OK);
    }

    #[tokio::test]
    async fn require_auth_lets_ipv4_mapped_loopback_through() {
        let db = setup_db().await;
        let status = call(protected_app(db), "[::ffff:127.0.0.1]:4000", None, None).await;
        assert_eq!(status, StatusCode::OK);
    }

    #[tokio::test]
    async fn require_auth_rejects_remote_without_token() {
        let db = setup_db().await;
        assert_eq!(
            call(protected_app(db), REMOTE, None, None).await,
            StatusCode::UNAUTHORIZED
        );
    }

    #[tokio::test]
    async fn require_auth_accepts_remote_with_valid_bearer() {
        let db = db_with_session("good-token").await;
        assert_eq!(
            call(protected_app(db), REMOTE, Some("good-token"), None).await,
            StatusCode::OK
        );
    }

    #[tokio::test]
    async fn require_auth_accepts_remote_with_valid_cookie() {
        let db = db_with_session("good-token").await;
        assert_eq!(
            call(protected_app(db), REMOTE, None, Some("good-token")).await,
            StatusCode::OK
        );
    }

    #[tokio::test]
    async fn require_auth_rejects_unknown_token() {
        let db = db_with_session("good-token").await;
        assert_eq!(
            call(protected_app(db), REMOTE, Some("bad-token"), None).await,
            StatusCode::UNAUTHORIZED
        );
    }

    #[tokio::test]
    async fn require_auth_rejects_expired_session() {
        let db = setup_db().await;
        db.insert_session(&hash_token("old"), 1, now_secs() - 5).await.unwrap();
        assert_eq!(
            call(protected_app(db), REMOTE, Some("old"), None).await,
            StatusCode::UNAUTHORIZED
        );
    }

    #[tokio::test]
    async fn require_auth_rejects_the_stored_hash_used_as_a_token() {
        // Leaking the DB must not let someone authenticate with the stored value
        let db = db_with_session("good-token").await;
        let stolen = hash_token("good-token");
        assert_eq!(
            call(protected_app(db), REMOTE, Some(&stolen), None).await,
            StatusCode::UNAUTHORIZED
        );
    }

    #[tokio::test]
    async fn require_auth_returns_500_on_db_error_for_remote() {
        let db = broken_db().await;
        assert_eq!(
            call(protected_app(db), REMOTE, Some("tok"), None).await,
            StatusCode::INTERNAL_SERVER_ERROR
        );
    }

    #[tokio::test]
    async fn require_auth_localhost_skips_db_entirely() {
        // Even with a dead DB, localhost still gets through
        let db = broken_db().await;
        assert_eq!(call(protected_app(db), LOCAL, None, None).await, StatusCode::OK);
    }

    // ---------- end-to-end flow ----------

    #[tokio::test]
    async fn full_flow_setup_login_access_logout() {
        let db = setup_db().await;

        Database::setup(State(db.clone()), ConnectInfo(addr(LOCAL)), Json(creds("admin", "pw")))
            .await
            .unwrap();

        let (jar, _) = Database::login(State(db.clone()), CookieJar::new(), Json(creds("admin", "pw")))
            .await
            .unwrap();
        let token = jar.get(SESSION_COOKIE).unwrap().value().to_string();

        // remote client can now reach the protected route
        assert_eq!(
            call(protected_app(db.clone()), REMOTE, Some(&token), None).await,
            StatusCode::OK
        );

        Database::logout(State(db.clone()), jar, HeaderMap::new()).await.unwrap();

        // ...and can't after logging out
        assert_eq!(
            call(protected_app(db), REMOTE, Some(&token), None).await,
            StatusCode::UNAUTHORIZED
        );
    }
}