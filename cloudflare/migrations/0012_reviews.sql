
CREATE TABLE reviews (
 id TEXT PRIMARY KEY NOT NULL,cafe_id TEXT NOT NULL REFERENCES cafes(id),author_id TEXT NOT NULL REFERENCES users(id),
 taste INTEGER NOT NULL CHECK(typeof(taste)='integer' AND taste BETWEEN 1 AND 5),service INTEGER NOT NULL CHECK(typeof(service)='integer' AND service BETWEEN 1 AND 5),comfort INTEGER NOT NULL CHECK(typeof(comfort)='integer' AND comfort BETWEEN 1 AND 5),value INTEGER NOT NULL CHECK(typeof(value)='integer' AND value BETWEEN 1 AND 5),study INTEGER NOT NULL CHECK(typeof(study)='integer' AND study BETWEEN 1 AND 5),
 overall_rating REAL GENERATED ALWAYS AS ((taste+service+comfort+value+study)/5.0) STORED,
 comment TEXT NOT NULL DEFAULT '' CHECK(length(comment)<=2000),status TEXT NOT NULL DEFAULT 'visible' CHECK(status IN('visible','hidden')),
 moderation_reason TEXT NOT NULL DEFAULT '',deleted_at TEXT,version INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,
 UNIQUE(id,cafe_id)
);
CREATE UNIQUE INDEX reviews_author_active ON reviews(cafe_id,author_id) WHERE deleted_at IS NULL;
CREATE INDEX reviews_public_recent ON reviews(cafe_id,status,deleted_at,created_at DESC,id);
CREATE INDEX reviews_public_rating ON reviews(cafe_id,status,deleted_at,overall_rating DESC,created_at DESC,id);
CREATE INDEX reviews_moderation ON reviews(deleted_at,status,created_at DESC,id);
CREATE TABLE review_replies (
 review_id TEXT PRIMARY KEY NOT NULL,cafe_id TEXT NOT NULL,author_id TEXT NOT NULL REFERENCES users(id),
 text TEXT NOT NULL CHECK(length(text) BETWEEN 1 AND 2000),version INTEGER NOT NULL DEFAULT 1,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,
 FOREIGN KEY(review_id,cafe_id) REFERENCES reviews(id,cafe_id)
);
CREATE TABLE review_reports (
 id TEXT PRIMARY KEY NOT NULL,review_id TEXT NOT NULL,cafe_id TEXT NOT NULL,reporter_id TEXT NOT NULL REFERENCES users(id),
 reason TEXT NOT NULL CHECK(length(reason) BETWEEN 1 AND 500),created_at TEXT NOT NULL,
 FOREIGN KEY(review_id,cafe_id) REFERENCES reviews(id,cafe_id),UNIQUE(review_id,reporter_id)
);
CREATE INDEX review_reports_queue ON review_reports(created_at DESC,id);
CREATE TABLE review_moderation_audit (
 id TEXT PRIMARY KEY NOT NULL,review_id TEXT NOT NULL,cafe_id TEXT NOT NULL,actor_id TEXT NOT NULL,action TEXT NOT NULL CHECK(action IN('hide','restore')),
 reason TEXT NOT NULL,at TEXT NOT NULL,FOREIGN KEY(review_id,cafe_id) REFERENCES reviews(id,cafe_id)
);
CREATE INDEX review_moderation_cafe ON review_moderation_audit(cafe_id,review_id,at DESC,id);
CREATE TABLE cafe_rating_summary (
 cafe_id TEXT PRIMARY KEY NOT NULL REFERENCES cafes(id),review_count INTEGER NOT NULL DEFAULT 0 CHECK(review_count>=0),
 sum_taste INTEGER NOT NULL DEFAULT 0 CHECK(sum_taste>=0),sum_service INTEGER NOT NULL DEFAULT 0 CHECK(sum_service>=0),sum_comfort INTEGER NOT NULL DEFAULT 0 CHECK(sum_comfort>=0),sum_value INTEGER NOT NULL DEFAULT 0 CHECK(sum_value>=0),sum_study INTEGER NOT NULL DEFAULT 0 CHECK(sum_study>=0),updated_at TEXT NOT NULL
);
CREATE TABLE cafe_rating_bins (
 cafe_id TEXT NOT NULL REFERENCES cafes(id),criterion TEXT NOT NULL CHECK(criterion IN('taste','service','comfort','value','study','overall')),
 stars INTEGER NOT NULL CHECK(stars BETWEEN 1 AND 5),count INTEGER NOT NULL CHECK(count>=0),PRIMARY KEY(cafe_id,criterion,stars)
);
CREATE TRIGGER reviews_aggregate_insert AFTER INSERT ON reviews BEGIN 
 INSERT INTO cafe_rating_summary(cafe_id,review_count,sum_taste,sum_service,sum_comfort,sum_value,sum_study,updated_at)
 SELECT NEW.cafe_id,1,1*NEW.taste,1*NEW.service,1*NEW.comfort,1*NEW.value,1*NEW.study,NEW.updated_at WHERE NEW.status='visible' AND NEW.deleted_at IS NULL
 ON CONFLICT(cafe_id) DO UPDATE SET review_count=review_count+1,sum_taste=sum_taste+1*NEW.taste,sum_service=sum_service+1*NEW.service,sum_comfort=sum_comfort+1*NEW.comfort,sum_value=sum_value+1*NEW.value,sum_study=sum_study+1*NEW.study,updated_at=NEW.updated_at;
 INSERT INTO cafe_rating_bins(cafe_id,criterion,stars,count) SELECT NEW.cafe_id,'taste',NEW.taste,1 WHERE NEW.status='visible' AND NEW.deleted_at IS NULL ON CONFLICT(cafe_id,criterion,stars) DO UPDATE SET count=count+1;
INSERT INTO cafe_rating_bins(cafe_id,criterion,stars,count) SELECT NEW.cafe_id,'service',NEW.service,1 WHERE NEW.status='visible' AND NEW.deleted_at IS NULL ON CONFLICT(cafe_id,criterion,stars) DO UPDATE SET count=count+1;
INSERT INTO cafe_rating_bins(cafe_id,criterion,stars,count) SELECT NEW.cafe_id,'comfort',NEW.comfort,1 WHERE NEW.status='visible' AND NEW.deleted_at IS NULL ON CONFLICT(cafe_id,criterion,stars) DO UPDATE SET count=count+1;
INSERT INTO cafe_rating_bins(cafe_id,criterion,stars,count) SELECT NEW.cafe_id,'value',NEW.value,1 WHERE NEW.status='visible' AND NEW.deleted_at IS NULL ON CONFLICT(cafe_id,criterion,stars) DO UPDATE SET count=count+1;
INSERT INTO cafe_rating_bins(cafe_id,criterion,stars,count) SELECT NEW.cafe_id,'study',NEW.study,1 WHERE NEW.status='visible' AND NEW.deleted_at IS NULL ON CONFLICT(cafe_id,criterion,stars) DO UPDATE SET count=count+1;
INSERT INTO cafe_rating_bins(cafe_id,criterion,stars,count) SELECT NEW.cafe_id,'overall',CAST((NEW.taste+NEW.service+NEW.comfort+NEW.value+NEW.study+2)/5 AS INTEGER),1 WHERE NEW.status='visible' AND NEW.deleted_at IS NULL ON CONFLICT(cafe_id,criterion,stars) DO UPDATE SET count=count+1; END;
CREATE TRIGGER reviews_aggregate_update AFTER UPDATE ON reviews
WHEN OLD.taste<>NEW.taste OR OLD.service<>NEW.service OR OLD.comfort<>NEW.comfort OR OLD.value<>NEW.value OR OLD.study<>NEW.study OR OLD.status<>NEW.status OR OLD.deleted_at IS NOT NEW.deleted_at
BEGIN UPDATE cafe_rating_summary SET review_count=review_count-1,sum_taste=sum_taste-OLD.taste,sum_service=sum_service-OLD.service,sum_comfort=sum_comfort-OLD.comfort,sum_value=sum_value-OLD.value,sum_study=sum_study-OLD.study,updated_at=NEW.updated_at WHERE cafe_id=OLD.cafe_id AND OLD.status='visible' AND OLD.deleted_at IS NULL;
 UPDATE cafe_rating_bins SET count=count-1 WHERE cafe_id=OLD.cafe_id AND criterion='taste' AND stars=OLD.taste AND OLD.status='visible' AND OLD.deleted_at IS NULL;
UPDATE cafe_rating_bins SET count=count-1 WHERE cafe_id=OLD.cafe_id AND criterion='service' AND stars=OLD.service AND OLD.status='visible' AND OLD.deleted_at IS NULL;
UPDATE cafe_rating_bins SET count=count-1 WHERE cafe_id=OLD.cafe_id AND criterion='comfort' AND stars=OLD.comfort AND OLD.status='visible' AND OLD.deleted_at IS NULL;
UPDATE cafe_rating_bins SET count=count-1 WHERE cafe_id=OLD.cafe_id AND criterion='value' AND stars=OLD.value AND OLD.status='visible' AND OLD.deleted_at IS NULL;
UPDATE cafe_rating_bins SET count=count-1 WHERE cafe_id=OLD.cafe_id AND criterion='study' AND stars=OLD.study AND OLD.status='visible' AND OLD.deleted_at IS NULL;
UPDATE cafe_rating_bins SET count=count-1 WHERE cafe_id=OLD.cafe_id AND criterion='overall' AND stars=CAST((OLD.taste+OLD.service+OLD.comfort+OLD.value+OLD.study+2)/5 AS INTEGER) AND OLD.status='visible' AND OLD.deleted_at IS NULL; 
 INSERT INTO cafe_rating_summary(cafe_id,review_count,sum_taste,sum_service,sum_comfort,sum_value,sum_study,updated_at)
 SELECT NEW.cafe_id,1,1*NEW.taste,1*NEW.service,1*NEW.comfort,1*NEW.value,1*NEW.study,NEW.updated_at WHERE NEW.status='visible' AND NEW.deleted_at IS NULL
 ON CONFLICT(cafe_id) DO UPDATE SET review_count=review_count+1,sum_taste=sum_taste+1*NEW.taste,sum_service=sum_service+1*NEW.service,sum_comfort=sum_comfort+1*NEW.comfort,sum_value=sum_value+1*NEW.value,sum_study=sum_study+1*NEW.study,updated_at=NEW.updated_at;
 INSERT INTO cafe_rating_bins(cafe_id,criterion,stars,count) SELECT NEW.cafe_id,'taste',NEW.taste,1 WHERE NEW.status='visible' AND NEW.deleted_at IS NULL ON CONFLICT(cafe_id,criterion,stars) DO UPDATE SET count=count+1;
INSERT INTO cafe_rating_bins(cafe_id,criterion,stars,count) SELECT NEW.cafe_id,'service',NEW.service,1 WHERE NEW.status='visible' AND NEW.deleted_at IS NULL ON CONFLICT(cafe_id,criterion,stars) DO UPDATE SET count=count+1;
INSERT INTO cafe_rating_bins(cafe_id,criterion,stars,count) SELECT NEW.cafe_id,'comfort',NEW.comfort,1 WHERE NEW.status='visible' AND NEW.deleted_at IS NULL ON CONFLICT(cafe_id,criterion,stars) DO UPDATE SET count=count+1;
INSERT INTO cafe_rating_bins(cafe_id,criterion,stars,count) SELECT NEW.cafe_id,'value',NEW.value,1 WHERE NEW.status='visible' AND NEW.deleted_at IS NULL ON CONFLICT(cafe_id,criterion,stars) DO UPDATE SET count=count+1;
INSERT INTO cafe_rating_bins(cafe_id,criterion,stars,count) SELECT NEW.cafe_id,'study',NEW.study,1 WHERE NEW.status='visible' AND NEW.deleted_at IS NULL ON CONFLICT(cafe_id,criterion,stars) DO UPDATE SET count=count+1;
INSERT INTO cafe_rating_bins(cafe_id,criterion,stars,count) SELECT NEW.cafe_id,'overall',CAST((NEW.taste+NEW.service+NEW.comfort+NEW.value+NEW.study+2)/5 AS INTEGER),1 WHERE NEW.status='visible' AND NEW.deleted_at IS NULL ON CONFLICT(cafe_id,criterion,stars) DO UPDATE SET count=count+1; END;
CREATE TRIGGER reviews_identity_immutable BEFORE UPDATE OF cafe_id,author_id ON reviews
WHEN NEW.cafe_id<>OLD.cafe_id OR NEW.author_id<>OLD.author_id BEGIN SELECT RAISE(ABORT,'review_identity_immutable'); END;
CREATE TRIGGER reviews_no_physical_delete BEFORE DELETE ON reviews BEGIN SELECT RAISE(ABORT,'review_soft_delete_required'); END;
CREATE TRIGGER review_moderation_no_update BEFORE UPDATE ON review_moderation_audit BEGIN SELECT RAISE(ABORT,'review_audit_immutable'); END;
CREATE TRIGGER review_moderation_no_delete BEFORE DELETE ON review_moderation_audit BEGIN SELECT RAISE(ABORT,'review_audit_immutable'); END;
