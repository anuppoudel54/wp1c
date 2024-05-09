# Use an official Node.js runtime as the base image
FROM node:18-alpine3.18

# Set the working directory in the container
WORKDIR /app

# Copy package.json and package-lock.json to the working directory
COPY package*.json ./
COPY entry.sh ./

# Install application dependencies
# RUN npm install

# Copy the rest of the application source code to the working directory
# COPY . .

# Expose the port your application will run on
EXPOSE 3000

# Define the command to run your application
ENTRYPOINT [ "sh","entry.sh" ]
