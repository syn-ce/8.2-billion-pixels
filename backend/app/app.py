from flask import Flask, session
from redis import Redis
from flask_socketio import SocketIO, join_room, leave_room
from flask_cors import CORS, cross_origin
import redis
import sched, time
import uuid

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

# Store the sections as bits in redis
# TODO: use pipelining or scripting
for section in sections:
    redis.set(section['id'], '')
    nr = (section['botRight'][0] -  section['topLeft'][0] + 1) * (section['botRight'][1] - section['topLeft'][1] + 1) - 1
    nr = int(nr)
    redis.setbit(section['id'], nr, 0)

bitfield = 'bitfield'
redis.set(bitfield, "this is some random text")
redis.setbit(bitfield, NR_BITS - 1, 0)

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
    session['user_id'] = str(uuid.uuid4())
    app.logger.info(f'Client connected {redis.incr("clients", 0) + 1}')
    # TODO: care about this in the frontend
    socketio.emit('session', {'user_id': session['user_id']})

@socketio.on('disconnect')
def handle_disconnect():
    app.logger.info(f'Client disconnected {redis.decr("clients", 0) - 1}')

# TODO: add validation to all endpoints / messages
@socketio.on('subscribe')
def handle_subscribe(ids: list[int]):
    for id in ids:
        join_room(id)
    app.logger.info(f'sub {ids}')

@socketio.on('unsubscribe')
def handle_subscribe(ids):
    for id in ids:
        leave_room(id)
    app.logger.info(f'unsub {ids}')

@socketio.on('message')
def handle_message():
    app.logger.info('received message: ')

@socketio.on("active")
def handle_active():
    pass

if __name__ == '__main__':
    socketio.run(app, host='0.0.0.0', debug=True, allow_unsafe_werkzeug=True)