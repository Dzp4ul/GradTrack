# GradTrack Layered Architecture - AWS EC2

This diagram updates the previous GradTrack layered architecture to reflect the current feature set and the target deployment where both the frontend and backend run on AWS EC2.

Generated diagram files:

- `documentation/layered-architecture-ec2.png`
- `documentation/layered-architecture-ec2.svg`
- `documentation/layered-architecture-ec2.mmd`

```mermaid
flowchart LR
  subgraph USER["User / Client Layer"]
    PUBLIC["Public Visitor"]
    SUPER["Super Administrator"]
    ADMIN["Administrator"]
    REGISTRAR["Registrar"]
    DEAN["Dean"]
    GRAD["Graduate / Alumni"]
  end

  INTERNET(("Internet\nHTTPS"))

  subgraph AWS["AWS Cloud - GradTrack Production"]
    subgraph PRESENTATION["Presentation Layer\nAWS EC2 Frontend Instance"]
      FEHOST["Nginx or Apache Static Hosting\nReact + TypeScript + Vite"]
      PUBLIC_UI["Public Pages\nHome, About, FAQ, Privacy"]
      SURVEY_UI["Survey Experience\nToken Verification, Dynamic Survey Form"]
      ADMIN_UI["Admin Console\nDashboard, Graduates, Surveys, Reports, Users, Settings"]
      GRAD_UI["Graduate Portal\nProfile, Mentorship, Jobs, Alumni Rating"]
    end

    subgraph APPLICATION["Application Layer\nAWS EC2 Backend Instance"]
      APIHOST["Apache + PHP REST API\nSession Auth, CORS, JSON, Multipart Uploads"]
      AUTH["Authentication and Access Control\nStaff Auth, Graduate Auth, RBAC"]
      SURVEY["Graduate and Survey Services\nGraduate Management, Survey Builder, Tokens, Responses, Dean Status, Notifications"]
      ANALYTICS["Reports and Analytics\nDashboard Stats, Survey Analytics, Exports, Predictive Regression, AI Insights"]
      ENGAGE["Alumni Engagement\nAnnouncements, Mentorship, Jobs, Alumni Rating"]
      OPS["Administration and Files\nUsers, Settings, Database Backup, Profile Images, Documents, Job Requirements"]
    end

    subgraph DATA["Data / Storage / External Services"]
      RDS[("Amazon RDS MySQL\nUsers, roles, graduates, programs, surveys, responses, reports, mentorship, jobs")]
      FILES[("EC2 EBS / Upload Storage\nProfile images, alumni documents, job requirement files")]
      SMTP["SMTP Mail Service\nPHPMailer survey reminders"]
      GROQ["Groq Cloud API\nLLaMA AI analytics"]
    end
  end

  USER --> INTERNET
  INTERNET -->|"HTTPS page requests"| FEHOST
  FEHOST --> PUBLIC_UI
  FEHOST --> SURVEY_UI
  FEHOST --> ADMIN_UI
  FEHOST --> GRAD_UI
  FEHOST -->|"REST API over HTTPS\nJSON and multipart data"| APIHOST
  APIHOST --> AUTH
  APIHOST --> SURVEY
  APIHOST --> ANALYTICS
  APIHOST --> ENGAGE
  APIHOST --> OPS
  AUTH -->|"PDO MySQL"| RDS
  SURVEY -->|"PDO MySQL"| RDS
  ANALYTICS -->|"PDO MySQL"| RDS
  ENGAGE -->|"PDO MySQL"| RDS
  OPS -->|"PDO MySQL"| RDS
  OPS -->|"read/write uploaded files"| FILES
  SURVEY -->|"send reminder emails"| SMTP
  ANALYTICS -->|"AI prompt and analysis result"| GROQ
```

## Layer Notes

- User / Client Layer: public visitors, super administrator, administrator, registrar, dean, and graduate/alumni users access GradTrack through a browser.
- Presentation Layer: the React + TypeScript + Vite frontend is served from an AWS EC2 instance using Nginx or Apache.
- Application Layer: the PHP REST API runs on a separate AWS EC2 instance using Apache and handles authentication, graduate records, surveys, reports, alumni engagement, file uploads, and administrative actions.
- Data Layer: Amazon RDS MySQL stores the system data. Current uploaded files are stored under the backend `uploads` directory on EC2/EBS.
- External Services: PHPMailer sends survey reminder emails through an SMTP provider, and Groq's LLaMA model supports AI analytics.

If GradTrack later moves uploaded files to Amazon S3, replace the EC2 EBS / Upload Storage node with Amazon S3 Storage and route upload/download traffic from the backend API to S3.
