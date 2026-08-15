# CloudStore — Enterprise Distributed Cloud Storage & File Management Platform

[![CI/CD Pipeline](https://github.com/cloudstore/cloudstore/actions/workflows/ci-cd.yml/badge.svg)](https://github.com/cloudstore/cloudstore/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Java](https://img.shields.io/badge/Java-21-orange.svg)](https://www.oracle.com/java/)
[![Spring Boot](https://img.shields.io/badge/Spring_Boot-3.2.2-green.svg)](https://spring.io/projects/spring-boot)
[![React](https://img.shields.io/badge/React-19-61DAFB.svg)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6.svg)](https://www.typescriptlang.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791.svg)](https://www.postgresql.org/)
[![Apache Kafka](https://img.shields.io/badge/Apache_Kafka-7.5-231F20.svg)](https://kafka.apache.org/)
[![Redis](https://img.shields.io/badge/Redis-7-DC382D.svg)](https://redis.io/)

**CloudStore** is a high-throughput, cloud-native enterprise file management and cloud storage platform built with a Java Spring Boot microservices backend, Apache Kafka event streaming, Redis caching & rate-limiting, PostgreSQL relational storage, and a React/TypeScript frontend.

---

## 🌟 Key Features

- **Direct S3 Multipart Chunked Uploads**: 
  - Bypasses API server bottlenecks by uploading 5 MB file chunks directly to AWS S3 using short-lived pre-signed URLs.
  - Features real-time upload speed calculation (MB/s), ETA estimates, pause/resume capability, and upload cancellation cleanup (`AbortMultipartUpload`).
- **Materialized Path Hierarchical Tree Engine**:
  - Implements the materialized path pattern (`/root_id/parent_id/folder_id/`) in PostgreSQL for $O(\log N)$ subtree queries.
  - Prevents directory cycles during folder move operations and performs atomic recursive soft-deletions.
- **File Versioning & Atomic Rollbacks**:
  - Tracks complete file modification histories with unique S3 storage keys per version.
  - Enables instant rollback to any historical file version without data loss.
- **Multi-Tenant Organization & Storage Quotas**:
  - Enforces strict tenant isolation and storage quotas (e.g., 100 GB per organization).
  - Provides real-time quota consumption tracking and member permission management.
- **Asynchronous Audit Logging & Event Streaming**:
  - Publishes file lifecycle events (`FILE_UPLOADED`, `FOLDER_MOVED`, `FILE_DELETED`) to Apache Kafka (`file-events-topic`).
  - Consumed asynchronously by `audit-service` to maintain immutable compliance audit trails.
- **Sliding-Window Rate Limiting**:
  - Redis-backed filter (`RateLimitingFilter`) enforcing a sliding-window limit (100 req/min per IP) to guard against DDoS and API abuse.
- **Fuzzy Search with PostgreSQL Trigram GIN Indexes**:
  - Leverages `pg_trgm` GIN indexing for fast, low-latency file and directory full-text search across large datasets.
- **Interactive System Architecture & API Explorer**:
  - Embedded microservices topology diagram, sequence flow visualizers, and interactive Swagger/OpenAPI documentation inspector.

---

## 📐 Microservices Architecture

```
                                  +-----------------------+
                                  |   React / Express     |
                                  |   Frontend Gateway    |
                                  |      (Port 3000)      |
                                  +-----------+-----------+
                                              |
                   +--------------------------+--------------------------+
                   |                          |                          |
                   v                          v                          v
      +------------------------+ +------------------------+ +------------------------+
      |      File Service      | |      Auth Service      | |     Audit Service      |
      |   (Java 21 / Spring)   | |   (Java 21 / Spring)   | |   (Java 21 / Spring)   |
      |      (Port 8081)       | |      (Port 8082)       | |      (Port 8083)       |
      +-----------+------------+ +-----------+------------+ +-----------+------------+
                  |                          |                          ^
        +---------+---------+                |                          | (Kafka Consumer)
        |                   |                |                          |
        v                   v                v                          |
+---------------+   +---------------+   +---------------+     +------------------+
| PostgreSQL 16 |   |    Redis 7    |   |    AWS S3     |     |   Apache Kafka   |
| (Relational)  |   | (Rate Limit)  |   | (Object Store)|     |  (Event Stream)  |
+---------------+   +---------------+   +---------------+     +------------------+
```

### Microservices Breakdown

| Service | Port | Description | Tech Stack |
| :--- | :--- | :--- | :--- |
| **`file-service`** | `8081` | Core metadata management, materialized path tree ops, S3 presigning, Kafka event publishing | Java 21, Spring Boot 3.2, JPA, S3 SDK v2, Redis, Kafka |
| **`auth-service`** | `8082` | Authentication, JWT token issuance, user identity, and tenant organization context | Java 21, Spring Boot 3.2, Spring Security, JWT |
| **`audit-service`**| `8083` | Asynchronous event listener consuming file operations from Kafka for compliance auditing | Java 21, Spring Boot 3.2, Spring Kafka, JPA |
| **`frontend`** | `3000` | Single Page Application featuring interactive file manager, uploader, analytics, & API viewer | React 19, TypeScript, Tailwind CSS v4, AWS SDK v3 |

---

## 📁 Repository Directory Structure

```
cloudstore/
├── docker-compose.yml                  # Infrastructure orchestration (Postgres, Redis, Kafka, Microservices)
├── database/
│   └── init-schema.sql                 # PostgreSQL schema DDL, indexes (GIN, materialized path), and seed data
├── .github/
│   └── workflows/
│       └── ci-cd.yml                   # GitHub Actions matrix CI/CD pipeline (Maven tests & GHCR push)
│
├── file-service/                       # Spring Boot File & Folder Microservice
│   ├── Dockerfile
│   ├── pom.xml
│   └── src/
│       ├── main/java/com/cloudstore/fileservice/
│       │   ├── config/                 # Kafka & Redis connection configurations
│       │   ├── controller/             # REST Endpoints (FileController, FolderController)
│       │   ├── dto/                    # Request/Response records with Bean Validation
│       │   ├── exception/              # Global exception handling (@RestControllerAdvice)
│       │   ├── model/                  # JPA Entities (FileEntity, FileVersion, FolderEntity)
│       │   ├── repository/             # Spring Data JPA Repositories
│       │   ├── security/               # Redis sliding window rate limiting filter
│       │   └── service/                # Business logic (S3 Storage, Folder Tree, Metadata)
│       └── test/                       # JUnit 5 & Mockito test suite
│
├── auth-service/                       # Spring Boot Auth Microservice
│   ├── Dockerfile
│   ├── pom.xml
│   └── src/
│
├── audit-service/                      # Spring Boot Event Consumer Microservice
│   ├── Dockerfile
│   ├── pom.xml
│   └── src/
│
└── src/                                # Frontend UI & Express Gateway
    ├── components/                     # FileExplorer, ChunkedUploader, FolderTree, Analytics, AuditLogs
    └── backend/                        # Node.js API Gateway & S3 Multipart Upload Route Handlers
```

---

## 🚀 Getting Started

### Prerequisites

Ensure you have the following installed locally:
- [Docker](https://www.docker.com/get-started) & [Docker Compose](https://docs.docker.com/compose/) (v2.0+)
- [Java 21 JDK](https://adoptium.net/) (for local microservice development)
- [Node.js 20+](https://nodejs.org/) & `npm`

---

### Quick Start with Docker Compose

1. **Clone the repository**:
   ```bash
   git clone https://github.com/cloudstore/cloudstore.git
   cd cloudstore
   ```

2. **Configure Environment Variables**:
   Copy `.env.example` to `.env` and fill in your AWS credentials:
   ```bash
   cp .env.example .env
   ```

3. **Launch the Entire Stack**:
   ```bash
   docker-compose up -d --build
   ```

4. **Verify Health**:
   - Web Platform: `http://localhost:3000`
   - File Service API Docs: `http://localhost:8081/swagger-ui.html`
   - Health Check: `curl http://localhost:8081/actuator/health`

---

## 🛠️ Configuration Options

| Environment Variable | Default Value | Description |
| :--- | :--- | :--- |
| `AWS_REGION` | `us-east-1` | AWS S3 Region |
| `AWS_ACCESS_KEY_ID` | — | AWS Access Key Credentials |
| `AWS_SECRET_ACCESS_KEY` | — | AWS Secret Access Key Credentials |
| `AWS_S3_BUCKET_NAME` | `cloudstore-bucket` | Target S3 Bucket for File Objects |
| `SPRING_DATASOURCE_URL` | `jdbc:postgresql://postgres:5432/cloudstore_db` | PostgreSQL JDBC Connection String |
| `SPRING_DATA_REDIS_HOST` | `redis` | Redis Cache Hostname |
| `SPRING_KAFKA_BOOTSTRAP_SERVERS` | `kafka:29092` | Apache Kafka Broker Bootstrap Servers |

---

## 🧪 Testing & CI/CD Pipeline

The project includes unit tests for backend business logic using JUnit 5 and Mockito.

### Run Backend Tests Locally

```bash
cd file-service
mvn test
```

### GitHub Actions Pipeline (`ci-cd.yml`)

The automated workflow triggers on push/pull requests to `main` and performs:
1. **Parallel Matrix Build**: Builds and runs unit tests for `file-service`, `auth-service`, and `audit-service` using JDK 21.
2. **Containerization & Registry Push**: Builds multi-stage Docker images and pushes them to GitHub Container Registry (`ghcr.io`).

---

## 📄 License

This project is licensed under the [MIT License](LICENSE).
