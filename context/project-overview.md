# Project Overview

## Overview

Beleg-Manager is a specialized, AI-driven Document Management System (DMS) built to eliminate the manual overhead of managing receipts, invoices, and vouchers. It is designed for freelancers and small business owners who use Google Workspace. The system automates the entire document lifecycle: from capture (via mobile photo, voice, email, or Telegram) to intelligent data extraction using the **Gemini 1.5 Flash/Pro API**, and finally to structured archival in **Google Drive** and automated bookkeeping in **Google Sheets**. Unlike generic cloud storage, Beleg-Manager understands the financial content of documents and organizes them logically without user intervention.

## Goals

1.  **Zero-Touch Archiving**: Automate the sorting and filing of documents into a `YYYY/MM` folder structure in Google Drive based on the document's extracted date.
2.  **High-Precision Extraction**: Leverage Gemini AI to extract `vendor`, `date`, `amount`, `currency`, `category`, and `payment_method` with >95% accuracy for standard European/US receipts.
3.  **Ubiquitous Ingestion**: Provide at least four low-friction ways to ingest documents: Direct Web Upload, Voice-to-Receipt, Google Drive Inbox polling, and a Telegram Bot.
4.  **Google-Native Persistence**: Use the user's existing Google account as the "database" (Sheets) and "file server" (Drive), ensuring data sovereignty and zero extra subscription costs.

## Core User Flow

1.  **Authentication & Setup**: User logs in via **Google OAuth 2.0**. On the first run, the system verifies and creates the `Beleg-Manager` root folder, `Inbox` and `Archive` subfolders, and a designated Google Sheet named `belege`.
2.  **Document Capture**:
    *   **Mobile/Web**: User uploads an image or uses the device camera.
    *   **Voice**: User speaks a description (e.g., "Lunch with client, 45 Euros at Starbucks").
    *   **Inbox**: User drops files into the Google Drive `Inbox` folder.
    *   **Telegram**: User sends a photo to the configured bot.
3.  **AI Extraction**: The backend passes the document (or audio transcription) to Gemini. The AI returns a structured JSON object containing all relevant receipt metadata.
4.  **Validation Loop**: The user sees a side-by-side view of the document and the extracted data. They can correct any AI errors or add missing tags.
5.  **Finalization**: The system moves the file from `Inbox` to the correct `Archive/YYYY/MM/` path, renames it for consistency (e.g., `YYYY-MM-DD_Vendor_Amount.pdf`), and appends a new row to the Google Sheet.

## Technical Features

### Extraction & AI
*   **Gemini 1.5 Integration**: Uses multimodal capabilities to "read" images and understand context.
*   **Audio Processing**: Uses the Web Speech API for real-time transcription before AI refinement.
*   **Auto-Categorization**: AI-driven assignment of tax categories based on vendor and items.

### Ingestion Channels
*   **Drive Poller**: A background cron-job that checks the `Inbox` folder every 5 minutes.
*   **Telegram Bot**: Webhook-based integration for instant photo submission.
*   **Gmail Integration**: Automated scanning of the user's inbox for digital invoices (PDF).

### Dashboard & Analytics
*   **Bento-Grid Dashboard**: A modern, high-density UI showing recent activity, extraction status, and monthly spending charts (Recharts).
*   **Bank Reconciliation**: Upload a bank CSV to match extracted receipts against actual bank transactions, highlighting missing documents.

## Scope

### In Scope
*   Full Google Workspace integration (Drive/Sheets/OAuth).
*   Multimodal AI extraction (Images/Text/Audio).
*   Automated document renaming and filing logic.
*   Cross-platform web interface (Vite/React).
*   Telegram Bot and Gmail monitoring.

### Out of Scope
*   Handling of non-financial documents (e.g., contracts, letters).
*   Direct tax filing with government authorities (ELSTER, etc.).
*   Support for non-Google storage (Dropbox, S3).
*   Multi-user collaboration (designed for individual account owners).

## Success Criteria

1.  **Onboarding Speed**: A fresh user goes from "Login" to "First Upload Ready" in under 20 seconds.
2.  **Extraction Reliability**: AI correctly identifies the total amount and currency in 98% of clear, well-lit receipt photos.
3.  **Filing Accuracy**: 100% of confirmed documents are moved to the correct folder path in Google Drive.
4.  **Reconciliation Efficiency**: The bank matching tool identifies at least 80% of matching transactions automatically.
