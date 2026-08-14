# nginx con certificado autofirmado en :443, para el activo 172.20.0.10 (web publica)
FROM nginx:1.25-alpine

RUN apk add --no-cache openssl \
 && mkdir -p /etc/nginx/ssl \
 && openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
    -keyout /etc/nginx/ssl/selfsigned.key \
    -out /etc/nginx/ssl/selfsigned.crt \
    -subj "/CN=lab.local"

COPY default.conf /etc/nginx/conf.d/default.conf

EXPOSE 443
