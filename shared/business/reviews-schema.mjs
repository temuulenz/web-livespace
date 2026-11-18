const criteria=['taste','service','comfort','value','study'];
const total=alias=>criteria.map(k=>`${alias}.${k}`).join('+');
const active=alias=>`${alias}.status='visible' AND ${alias}.deleted_at IS NULL`;
function aggregate(alias,sign){
 if(sign===-1)return `UPDATE cafe_rating_summary SET review_count=review_count-1,${criteria.map(k=>`sum_${k}=sum_${k}-${alias}.${k}`).join(',')},updated_at=NEW.updated_at WHERE cafe_id=${alias}.cafe_id AND ${active(alias)};
 ${[...criteria,'overall'].map(k=>`UPDATE cafe_rating_bins SET count=count-1 WHERE cafe_id=${alias}.cafe_id AND criterion='${k}' AND stars=${k==='overall'?`CAST((${total(alias)}+2)/5 AS INTEGER)`:`${alias}.${k}`} AND ${active(alias)};`).join('\n')}`;
 return `
 INSERT INTO cafe_rating_summary(cafe_id,review_count,${criteria.map(k=>'sum_'+k).join(',')},updated_at)
 SELECT ${alias}.cafe_id,${sign},${criteria.map(k=>`${sign}*${alias}.${k}`).join(',')},${alias}.updated_at WHERE ${active(alias)}
 ON CONFLICT(cafe_id) DO UPDATE SET review_count=review_count+${sign},${criteria.map(k=>`sum_${k}=sum_${k}+${sign}*${alias}.${k}`).join(',')},updated_at=${alias}.updated_at;
 ${[...criteria,'overall'].map(k=>`INSERT INTO cafe_rating_bins(cafe_id,criterion,stars,count) SELECT ${alias}.cafe_id,'${k}',${k==='overall'?`CAST((${total(alias)}+2)/5 AS INTEGER)`:`${alias}.${k}`},${sign} WHERE ${active(alias)} ON CONFLICT(cafe_id,criterion,stars) DO UPDATE SET count=count+${sign};`).join('\n')}`;}
export const REVIEWS_SCHEMA = `
CREATE TABLE reviews (
 id TEXT PRIMARY KEY NOT NULL,cafe_id TEXT NOT NULL REFERENCES cafes(id),author_id TEXT NOT NULL REFERENCES users(id),
 ${criteria.map(k=>`${k} INTEGER NOT NULL CHECK(typeof(${k})='integer' AND ${k} BETWEEN 1 AND 5)`).join(',')},
 overall_rating REAL GENERATED ALWAYS AS ((${criteria.join('+')})/5.0) STORED,
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
 ${criteria.map(k=>`sum_${k} INTEGER NOT NULL DEFAULT 0 CHECK(sum_${k}>=0)`).join(',')},updated_at TEXT NOT NULL
);
CREATE TABLE cafe_rating_bins (
 cafe_id TEXT NOT NULL REFERENCES cafes(id),criterion TEXT NOT NULL CHECK(criterion IN('taste','service','comfort','value','study','overall')),
 stars INTEGER NOT NULL CHECK(stars BETWEEN 1 AND 5),count INTEGER NOT NULL CHECK(count>=0),PRIMARY KEY(cafe_id,criterion,stars)
);
CREATE TRIGGER reviews_aggregate_insert AFTER INSERT ON reviews BEGIN ${aggregate('NEW',1)} END;
CREATE TRIGGER reviews_aggregate_update AFTER UPDATE ON reviews
WHEN ${criteria.map(k=>`OLD.${k}<>NEW.${k}`).join(' OR ')} OR OLD.status<>NEW.status OR OLD.deleted_at IS NOT NEW.deleted_at
BEGIN ${aggregate('OLD',-1)} ${aggregate('NEW',1)} END;
CREATE TRIGGER reviews_identity_immutable BEFORE UPDATE OF cafe_id,author_id ON reviews
WHEN NEW.cafe_id<>OLD.cafe_id OR NEW.author_id<>OLD.author_id BEGIN SELECT RAISE(ABORT,'review_identity_immutable'); END;
CREATE TRIGGER reviews_no_physical_delete BEFORE DELETE ON reviews BEGIN SELECT RAISE(ABORT,'review_soft_delete_required'); END;
CREATE TRIGGER review_moderation_no_update BEFORE UPDATE ON review_moderation_audit BEGIN SELECT RAISE(ABORT,'review_audit_immutable'); END;
CREATE TRIGGER review_moderation_no_delete BEFORE DELETE ON review_moderation_audit BEGIN SELECT RAISE(ABORT,'review_audit_immutable'); END;
`;
