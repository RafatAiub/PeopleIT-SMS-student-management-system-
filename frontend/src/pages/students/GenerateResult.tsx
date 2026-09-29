import React, { useState } from 'react';
import { PageHeader } from '../../components/ui/Display';
import { Tabs, TabPanel } from '../../components/ui/Tabs';
import GenerateResultByClass from './GenerateResultByClass';
import GenerateResultSingleStudent from './GenerateResultSingleStudent';

type ViewTab = 'class' | 'student';

/**
 * Two ways to reach a report card, kept side by side rather than one
 * replacing the other:
 *  - "By class"       — pick a class/section + exam, see who has results,
 *                        open any student's report card (GenerateResultByClass).
 *  - "Single student"  — the original flow: search a student, pick an exam,
 *                        download their report card (GenerateResultSingleStudent).
 */
const GenerateResult = () => {
  const [tab, setTab] = useState<ViewTab>('class');

  return (
    <div className="space-y-6">
      <PageHeader
        title="Generate Result"
        description="Find a class's results, or a single student's report card."
      />

      <Tabs
        tabs={[
          { id: 'class', label: 'By class' },
          { id: 'student', label: 'Single student' },
        ]}
        value={tab}
        onChange={(id) => setTab(id as ViewTab)}
        label="Generate Result views"
      />

      <TabPanel id="class" value={tab}>
        <GenerateResultByClass />
      </TabPanel>
      <TabPanel id="student" value={tab}>
        <GenerateResultSingleStudent />
      </TabPanel>
    </div>
  );
};

export default GenerateResult;
