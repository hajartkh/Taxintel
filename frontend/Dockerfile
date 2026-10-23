# ---- dev: ng serve met hot reload (gebruikt door docker-compose) ----
FROM node:22-alpine AS dev
WORKDIR /app
RUN npm install -g @angular/cli@20
EXPOSE 4200

# ---- build: productie-build van de Angular app ----
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npx ng build --configuration production

# ---- prod: statische files via nginx ----
FROM nginx:1.27-alpine AS prod
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist/*/browser /usr/share/nginx/html
EXPOSE 80
