# Use the official MySQL image as the base image
FROM mysql:latest

# Copy SQL script with table creation statements to the container
COPY ./init.sql /docker-entrypoint-initdb.d/


