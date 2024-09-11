from flask import Flask
from redis import Redis
from flask_socketio import SocketIO
from flask_cors import CORS, cross_origin
import redis
import sched, time

from sections import Section, Point2D, split_bits

app = Flask(__name__)
app.config['SECRET_KEY'] = 'secret!'
CORS(app)
socketio = SocketIO(app, cors_allowed_origins="*")
redis = Redis(host='redis', port=6379)
# A billion bits.
NR_BITS = 1000000
# Aspect ratio of W:H
ASP_RATIO_REL_W = 10
ASP_RATIO_REL_H = 10

sections: list[Section] = split_bits(NR_BITS, ASP_RATIO_REL_W, ASP_RATIO_REL_H, 10, 10)
print(sections)
print(len(sections))

bitfield = 'bitfield'
redis.set(bitfield, "this is some random text")
redis.setbit(bitfield, NR_BITS - 1, 1)

# The sections are going to stored in redis individually.

#scheduler = sched.scheduler(time.time, time.sleep)
#scheduler.enter(1, 1, update_clients, (scheduler, socketio, redis))
#def update_clients(scheduler: sched.scheduler, socketio: SocketIO, redis: Redis):
#    scheduler.enter(1, 1, update_clients, (scheduler, socketio, redis))
#    socketio.emit()

@cross_origin
@app.route('/bits')
def get_img():
    app.logger.info(len(redis.get(bitfield)))
    return redis.get(bitfield)

@cross_origin
@app.route('/sections')
def get_sections():
    return sections

@socketio.on('connect')
def handle_connect():
    app.logger.info(f'Client connected {redis.incr("clients", 0) + 1}')

@socketio.on('disconnect')
def handle_disconnect():
    app.logger.info(f'Client disconnected {redis.decr("clients", 0) - 1}')

@socketio.on('message')
def handle_message():
    app.logger.info('received message: ')

@socketio.on("active")
def handle_active():
    pass

if __name__ == '__main__':
    socketio.run(app, host='0.0.0.0', debug=True, allow_unsafe_werkzeug=True)