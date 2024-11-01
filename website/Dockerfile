FROM node:alpine AS development

WORKDIR /app

COPY package.json package.json
COPY vite.config.ts vite.config.ts
RUN yarn

COPY index.html index.html
COPY src src

CMD ["yarn", "dev"]


FROM node:alpine AS build
WORKDIR /app

COPY package.json package.json
COPY yarn.lock yarn.lock
COPY tsconfig.json tsconfig.json
COPY vite.config.ts vite.config.ts
RUN yarn

COPY index.html index.html
COPY src src

RUN yarn build


FROM nginx:alpine AS production
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
CMD ["nginx", "-g", "daemon off;"]