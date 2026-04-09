from a2wsgi import WSGIMiddleware
from app import create_app
from mangum import Mangum

flask_app = create_app()
handler = Mangum(WSGIMiddleware(flask_app), lifespan="off")
