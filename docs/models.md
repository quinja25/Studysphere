# Data Models (Key Fields)

**Users**: id, name, email, username, password, role ENUM('student','alumni'), isVerified, xp, level, curriculum, subject, targetUniversity, major, gradeLevel, isPublic, bio, linkedinUrl, githubUrl, website, aiCreditsUsed, aiCreditsResetAt, currentStreak, longestStreak, lastStudyDate, weeklyGoalMinutes (120), weeklyStudiedMinutes, totalStudyMinutes, totalSessions, trustScore (100.0), isAdmin, isShadowBanned, isPro, proExpiresAt, stripeCustomerId

**Groups**: id, groupName, major, subject, gradeLevel, leader, isPublic, password (hashed), maxParticipants (10)

**Chats**: author, message, time, isPinned, GroupId FK

**AiMessages**: role ENUM('user','assistant'), content, tokens, groupId FK, userId FK

**StudySessions**: userId FK, groupId FK, startedAt, endedAt, durationMinutes, xpEarned

**Questions**: title, body, subject, authorId FK, isAnswered, tags (comma-separated)
**Answers**: content, questionId FK, authorId FK, isAccepted, votes
**WikiArticles**: title, content, subject, authorId FK, views, tags
**Posts**: title, content, type ENUM('blog','advice'), authorId FK, likes
**Resources**: title, description, content, price, authorId FK, type, downloads
**Endorsements**: studentId FK, alumniId FK, message — UNIQUE(studentId, alumniId)
**UserResources**: userId FK, resourceId FK — UNIQUE
**UserDocuments**: userId FK, title, subject, docType ENUM('textbook','past_paper','notes','other'), pageCount, chunkCount
**TrustEvents**: userId FK, reportedBy FK, type ENUM('report','warning','ban','unban','trust_decrease','trust_increase'), reason, trustDelta, newTrustScore
**Reports**: reporterId FK, reportedUserId FK, type ENUM('spam','harassment','inappropriate','impersonation','other'), description, status ENUM('pending','reviewed','dismissed','actioned')
**ContentEmbeddings**: sourceType ENUM('wiki','question','answer','resource','post','document'), sourceId, chunkIndex, chunkText, embedding BLOB (Float32Array), tokenCount, subject
**SessionRecaps**: groupId FK, generatedBy FK, summary, topicsCovered JSON, actionItems JSON, participantIds JSON, durationMinutes, startedAt, endedAt
**SessionGoals**: userId FK, groupId FK, goal STRING, isCompleted, completedAt
**Notifications**: userId FK, type ENUM('answer','endorsement','report_actioned'), relatedType, relatedId, content STRING(500), link, isRead. Indexed on (userId, isRead) and (userId, createdAt).
**AiFeedback**: userId FK, messageId (nullable), queryText STRING(1000), rating ENUM('up','down'), comment STRING(1000) nullable, clickedSources TEXT (JSON array `{source, sourceId}`).
**WaitlistEntries**: email STRING UNIQUE, role ENUM('student','alumni','other'), curriculum STRING nullable.
