USE containers_db; -- Use the newly created database

CREATE TABLE containers (
    id INT AUTO_INCREMENT PRIMARY KEY,
    hostname VARCHAR(255) NOT NULL,
    container_id VARCHAR(255) NOT NULL,
    ports TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
