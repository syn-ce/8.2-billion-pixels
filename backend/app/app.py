import json
from flask import Flask, session
from redis import Redis
from flask_socketio import SocketIO, join_room, leave_room
from flask_cors import CORS, cross_origin
import uuid
import random, string
from apscheduler.schedulers.background import BackgroundScheduler
import logging

from sections import Section, Point2D, split_bits

def create_app():
    app = Flask(__name__)
    app.config['SECRET_KEY'] = 'secret!'
    CORS(app)
    # Logging
    gunicorn_logger = logging.getLogger('gunicorn.error')
    app.logger.handlers = gunicorn_logger.handlers
    app.logger.level = gunicorn_logger.level

    socketio = SocketIO(app, cors_allowed_origins="*")
    redis = Redis(host='redis', port=6379)
    # A billion bits (well, not during development).
    NR_BITS = 250000
    # Aspect ratio of W:H
    ASP_RATIO_REL_W = 10
    ASP_RATIO_REL_H = 10

    sections: list[Section] = split_bits(NR_BITS, ASP_RATIO_REL_W, ASP_RATIO_REL_H, 5, 5)
    print(len(sections))
    print(sections[0])
    # Store the sections as bits in redis
    # TODO: use pipelining or scripting
    for section in sections:
        width = int(section['botRight'][0] -  section['topLeft'][0])
        height = int(section['botRight'][1] - section['topLeft'][1])
        bytes_width = int(width // 8)
        bytes_height = height
        total = width * height
        nr_bytes = int(total // 8)

        #remainder = total % 8
        # TODO: reconsider remainder
        alt_bits =''.join(random.choices(string.ascii_uppercase + string.digits, k=nr_bytes+1)) # + 1 for remainder
        redis.set(section['id'], alt_bits)

    bitfield = 'bitfield'
    redis.set(bitfield, "this is some random text")
    redis.setbit(bitfield, NR_BITS - 1, 0)

    pubsub = redis.pubsub()
    pubsub.subscribe('set_pixel_channel')

    def handle_redis_messages():       
        message_count = 0
        while True:
            message = pubsub.get_message(timeout=0.01) # Return None after timeout
            if message is None:
                break
            if message['type'] == 'message':
                try:
                    data = json.loads(message['data'])
                    socketio.emit('set-pixel', data)
                except json.JSONDecodeError:
                    app.logger.error(f'Failed to decode message: {message['data']}')
            
            message_count += 1
            app.logger.info(message)
            #socketio.emit('set_pixel', )

            if message_count >= 100:
                break
        if message_count > 0:
            app.logger.info(f'Processed {message_count} messages')

    # TODO: when using multiple workers multiple schedulers are initialized, leading to the same message being processed multiple times -> bad
    scheduler = BackgroundScheduler()
    scheduler.add_job(handle_redis_messages, 'interval', seconds=0.1)
    scheduler.start()

    colors = [{'id': 0, 'rgb': [0, 0, 0]}, {'id': 1, 'rgb': [255, 255, 255]}]

    @cross_origin
    @app.route('/bits')
    def get_img():
        app.logger.info(len(redis.get(bitfield)))
        return redis.get(bitfield)

    @cross_origin
    @app.route('/colors')
    def get_colors():
        return colors

    @cross_origin
    @app.route('/sections')
    def get_sections():
        return sections

    @cross_origin
    @app.route('/section-data/<id>')
    def get_section_data(id):
        app.logger.info(f'Request for section {id}')
        return redis.get(id)

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

    @socketio.on('set_pixel')
    def handle_set_pixel(data):
        app.logger.info('received request')
        sectionId, pixelIdx, color = data
        redis.setbit(sectionId, pixelIdx, color)
        redis.publish('set_pixel_channel', message=json.dumps({'sectionId': sectionId, 'pixelIdx': pixelIdx, 'color': color}))

    @socketio.on('message')
    def handle_message():
        app.logger.info('received message: ')

    @socketio.on("active")
    def handle_active():
        pass

    return app, socketio

app, socketio = create_app()

if __name__ == '__main__':
    socketio.run(app, host='0.0.0.0', debug=True, allow_unsafe_werkzeug=True)
