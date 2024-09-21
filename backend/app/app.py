import json
from flask import Flask, session
from redis import Redis
from flask_socketio import SocketIO, join_room, leave_room
from flask_cors import CORS, cross_origin
import uuid
import logging

from sections import Section
from colors import Color, ColorProvider

def load_colors(redis: Redis):
    return {Color.from_24bit(int(col_val)) for col_val in redis.smembers('color_set')}

def load_sections(redis: Redis):
    sec_ids = [int(sec_id) for sec_id in redis.smembers('sec_ids')]
    return [Section.from_bytes(redis.get(f'sec_{sec_id}')) for sec_id in sec_ids]

def create_app():
    app = Flask(__name__)
    app.config['SECRET_KEY'] = 'secret!'
    CORS(app)

    socketio = SocketIO(app, cors_allowed_origins="*")
    redis = Redis(host='redis', port=6379)

    bits_per_color = int(redis.get('sections_bits_per_color'))

    colors = load_colors(redis)
    logging.info(f'Loaded colors from redis: {colors}')
    color_provider = ColorProvider(bits_per_color, [Color(255, 255, 255), Color(0, 0, 0), Color(52, 235, 168), Color(161, 52, 235)])
    colors_json = [{'id': id, 'rgb': color.rgb()} for id, color in color_provider.get_id_colors().items()]

    cur_nr_cols = int(redis.get('sections_nr_cols'))
    cur_nr_rows = int(redis.get('sections_nr_rows'))
    cur_sec_width = int(redis.get('sections_sec_width'))
    cur_sec_height = int(redis.get('sections_sec_height'))

    #sections: list[Section] = split_bits(NR_BITS, ASP_RATIO_REL_W, ASP_RATIO_REL_H, 5, 2)
    sections = load_sections(redis)
    sections_json = [section.to_json() for section in sections]
    print(len(sections))

    def handle_pubsub_set_pixel(message):
        try:
            data = json.loads(message['data'])
            socketio.emit('set-pixel', data)
            logging.info(f'Processed set-pixel {message["data"]}')
        except json.JSONDecodeError:
            logging.error(f'Failed to decode message: {message["data"]}')

    pubsub = redis.pubsub()
    pubsub.subscribe(**{'set_pixel_channel': handle_pubsub_set_pixel})
    # TODO: this leads to every worker picking this up and the messages getting processed multiple times per flask server instance
    thread = pubsub.run_in_thread(sleep_time=0.001)

    @cross_origin
    @app.route('/colors')
    def get_colors():
        return colors_json

    @cross_origin
    @app.route('/sections')
    def get_sections():
        return {'sections': sections_json, 'bitsPerPixel': bits_per_color}

    @cross_origin
    @app.route('/section-data/<id>')
    def get_section_data(id):
        logging.info(f'Request for section {id}')
        return redis.get(id)

    @socketio.on('connect')
    def handle_connect():
        session['user_id'] = str(uuid.uuid4())
        logging.info(f'Client connected {redis.incr("clients", 0) + 1}')
        # TODO: care about this in the frontend
        socketio.emit('session', {'user_id': session['user_id']})

    @socketio.on('disconnect')
    def handle_disconnect():
        logging.info(f'Client disconnected {redis.decr("clients", 0) - 1}')

    # TODO: add validation to all endpoints / messages
    @socketio.on('subscribe')
    def handle_subscribe(ids: list[int]):
        for id in ids:
            join_room(id)
        logging.info(f'sub {ids}')

    @socketio.on('unsubscribe')
    def handle_subscribe(ids):
        for id in ids:
            leave_room(id)
        logging.info(f'unsub {ids}')

    @socketio.on('set_pixel')
    def handle_set_pixel(data):
        logging.info('received request')
        sectionId, pixelIdx, color = data
        bitfield = redis.bitfield(sectionId)
        bitfield.set(f'u{bits_per_color}', f'#{pixelIdx}', color)
        bitfield.execute()
        redis.publish('set_pixel_channel', message=json.dumps({'sectionId': sectionId, 'pixelIdx': pixelIdx, 'color': color}))

    @socketio.on('message')
    def handle_message():
        logging.info('received message: ')

    @socketio.on("active")
    def handle_active():
        pass

    return app, socketio

app, socketio = create_app()

if __name__ == '__main__':
    socketio.run(app, host='0.0.0.0', debug=True, allow_unsafe_werkzeug=True)
