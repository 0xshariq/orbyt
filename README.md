# 🧠 Orbyt — Automation Framework (Planning Phase)

## 📌 Current Status

**Planning, architecture design, and boundary definition stage**

Orbyt is not yet released. It is being designed alongside MediaProc, but it is intended to become an independent automation framework in the future.

The goal is to design it correctly first, not rush implementation.

---

## 🏷 Framework Name

**Orbyt**

Meaning: Orchestrate + automate systems and workflows.

It is a **generic automation engine**, not a MediaProc component — MediaProc will only be one of its integrations.

---

## 🎯 Purpose of Orbyt

Orbyt will be a **workflow orchestration and automation framework** that allows developers to define, register, and run structured workflows using configuration files.

It handles:

- Workflow execution
- Scheduling
- Retry logic
- Step orchestration
- Context passing
- Hooks and lifecycle events
- Job management

---

## 🧩 Key Concept: Developer-Defined Workflow Structures

Orbyt is not limited to one workflow format.

It will allow developers to:

✔ Define their own workflow config file structure  
✔ Register that structure with Orbyt  
✔ Map their structure to Orbyt's internal workflow model

This means:

- MediaProc can define **media workflow structures**
- A web project can define **API workflow structures**
- Another tool can define **custom step types**

Orbyt acts as the execution brain.

---

## ⚙️ What Orbyt Provides Out of the Box

Orbyt will include predefined building blocks:

### 🕒 Scheduling System

- Cron-based jobs
- Delayed jobs
- Repeating jobs

---

### 🔄 Automation Functions

Reusable automation logic such as:

- Retry strategies
- Backoff logic
- Timeout handling
- Failure strategies
- Step result handling

---

### 🧠 Execution Core

- Sequential workflow execution
- Context engine
- Step result propagation
- Step dependency management

---

### 🪝 Hooks System

Lifecycle hooks:

- beforeWorkflow
- afterWorkflow
- beforeStep
- afterStep
- onError

---

### 📦 Step System

Orbyt will support multiple step types:

- Task steps
- Script steps
- Shell steps
- API call steps
- Delay/wait steps

---

### 🌐 Trigger System (Future)

Workflows won't only run on cron.

Triggers may include:

- File changes
- Webhooks
- Manual triggers
- Conditional triggers

---

### 🔌 Adapter Layer

Developers can create adapters to connect Orbyt to:

- MediaProc
- Web systems
- Custom tools

Adapters translate external systems into Orbyt steps.

---

## 🚫 What Orbyt Will NOT Do

Orbyt must remain independent.

It will not:

- Depend on MediaProc
- Be media-specific
- Contain CLI logic
- Know about plugins

MediaProc uses Orbyt — Orbyt does not know MediaProc.

---

## 🏗 Relationship with MediaProc

### Now

- Orbyt lives inside MediaProc monorepo
- Structured as an independent package
- Pipeline plugin acts as adapter

### Future

- Orbyt extracted into separate repository
- Treated as standalone automation framework
- MediaProc becomes a consumer

---

## 🌍 Long-Term Vision

Orbyt evolves into:

A **local-first, extensible automation framework** usable in:

- CLI tools
- Web applications
- Services
- Custom developer systems

MediaProc is the first ecosystem built on top of Orbyt.

---

## 🧠 Architectural Philosophy

Orbyt is infrastructure.

It focuses on:

- Clean boundaries
- Reusability
- Extensibility
- Stability before feature growth

This marks the shift from building tools → building platforms.
