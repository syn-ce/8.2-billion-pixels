FROM node:alpine

WORKDIR /app

COPY package.json package.json
COPY vite.config.ts vite.config.ts
RUN yarn

COPY index.html index.html
COPY src src

CMD ["yarn", "dev"]