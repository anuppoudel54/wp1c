# Use the official Node.js runtime as a parent image
FROM node:18

# Set the working directory in the container
WORKDIR /app

# Copy package.json and package-lock.json to the container
COPY package*.json ./

# Install application dependencies
RUN npm install

# Copy the rest of the application source code to the container
COPY . .

# Expose the port your application runs on (replace 3000 with your app's port)
EXPOSE 3000

# Define the command to run your application
CMD ["node", "app.js"]
