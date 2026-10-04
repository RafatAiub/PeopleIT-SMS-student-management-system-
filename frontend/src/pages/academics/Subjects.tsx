import React from 'react';
import { SimpleLookupManager } from '../../components/academics/SimpleLookupManager';

// GET /curriculum/subjects requires a `className` query param and returns
// SubjectOffering rows (subjectName/label/paper/...) for mark entry — not
// the flat Subject catalogue this page manages. GET /curriculum/subjects/catalog
// is the un-scoped Subject { id, name } list added alongside the
// POST/PUT/DELETE /curriculum/subjects routes for this page.
const Subjects = () => (
  <SimpleLookupManager
    title="Subject"
    apiBasePath="/curriculum/subjects"
    listPath="/curriculum/subjects/catalog"
    getDisplayName={(item) => item.name ?? ''}
    description="Create and manage the subject catalogue offered by the institution."
  />
);

export default Subjects;
