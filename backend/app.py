"""Flask app entrypoint.

Composition root only: load env, build the app, init the db, register
blueprints. All real logic lives in the per-feature modules.
"""
import os

from dotenv import load_dotenv
from flask import Flask, jsonify
from flask_cors import CORS
from sqlalchemy import text

load_dotenv()

from extensions import db  # noqa: E402


def create_app() -> Flask:
    app = Flask(__name__)

    # Frontend dev server runs on Vite (5173). We use cookies for auth, so
    # we MUST allow credentials and echo the exact origin (not '*').
    CORS(
        app,
        resources={r"/api/*": {"origins": ["http://localhost:5173", "http://127.0.0.1:5173"]}},
        supports_credentials=True,
    )

    app.config["SQLALCHEMY_DATABASE_URI"] = os.environ["DATABASE_URL"]
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

    db.init_app(app)

    # Models must be imported AFTER db.init_app so SQLAlchemy picks up
    # `db.Model` at class-definition time with the right registry.
    import models  # noqa: F401

    # Register blueprints
    from auth.routes import bp as auth_bp
    from planner.routes import bp as planner_bp
    from sessions.routes import bp as sessions_bp

    app.register_blueprint(auth_bp)
    app.register_blueprint(planner_bp)
    app.register_blueprint(sessions_bp)

    @app.route("/api/health")
    def health():
        return jsonify({"status": "ok"})

    @app.route("/api/db-health")
    def db_health():
        result = db.session.execute(text("SELECT 1")).scalar()
        return jsonify({"db": "ok", "select_one_returned": result})

    return app


app = create_app()


if __name__ == "__main__":
    # macOS AirPlay Receiver hijacks 5000, so default to 5050.
    # Override with PORT env var if you want a different port.
    port = int(os.environ.get("PORT", 5050))
    app.run(debug=True, port=port, threaded=True)
