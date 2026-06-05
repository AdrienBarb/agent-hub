-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "AgentRunStatus" AS ENUM ('pending', 'running', 'completed', 'failed');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('new', 'duplicate', 'not_a_fit', 'evaluated', 'tailored', 'applied', 'rejected');

-- CreateTable
CREATE TABLE "AgentRun" (
    "id" TEXT NOT NULL,
    "agentSlug" TEXT NOT NULL,
    "status" "AgentRunStatus" NOT NULL DEFAULT 'pending',
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "costUsd" DECIMAL(10,4),
    "langfuseTraceId" TEXT,
    "errorMessage" TEXT,

    CONSTRAINT "AgentRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "board" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "company" TEXT,
    "city" TEXT,
    "rawMarkdown" TEXT,
    "fitScore" DECIMAL(3,1),
    "fitReasoning" TEXT,
    "fitDetails" JSONB,
    "status" "JobStatus" NOT NULL DEFAULT 'new',
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resumeStoragePath" TEXT,
    "coverStoragePath" TEXT,
    "summaryStoragePath" TEXT,
    "diffStoragePath" TEXT,
    "tailoredAt" TIMESTAMP(3),
    "tailorDetails" JSONB,
    "resumePdfStoragePath" TEXT,
    "coverPdfStoragePath" TEXT,
    "renderedAt" TIMESTAMP(3),
    "renderDetails" JSONB,
    "duplicateOfId" TEXT,
    "runId" TEXT,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AgentRun_agentSlug_startedAt_idx" ON "AgentRun"("agentSlug", "startedAt" DESC);

-- CreateIndex
CREATE INDEX "AgentRun_status_idx" ON "AgentRun"("status");

-- CreateIndex
CREATE INDEX "Job_status_idx" ON "Job"("status");

-- CreateIndex
CREATE INDEX "Job_firstSeenAt_idx" ON "Job"("firstSeenAt" DESC);

-- CreateIndex
CREATE INDEX "Job_lastSeenAt_idx" ON "Job"("lastSeenAt" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "Job_board_slug_key" ON "Job"("board", "slug");

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_duplicateOfId_fkey" FOREIGN KEY ("duplicateOfId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_runId_fkey" FOREIGN KEY ("runId") REFERENCES "AgentRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

