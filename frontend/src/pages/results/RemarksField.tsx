// Shared remarks cell for MarksEntry's three entry modes (cards / subject /
// matrix). Wraps an AI-generated remark in <AiGeneratedNotice> so it's
// visibly flagged and stays in an editable textarea until the teacher saves
// — nothing AI-written is ever sent to a student/guardian unreviewed.
import React from 'react';
import { Loader2, Sparkles } from 'lucide-react';
import { AiGeneratedNotice } from '../../components/ui';

interface RemarksFieldProps {
  value: string;
  aiGenerated: boolean;
  generating: boolean;
  rows: number;
  onChange: (val: string) => void;
  onGenerate: () => void;
  textareaClassName?: string;
}

export const RemarksField: React.FC<RemarksFieldProps> = ({
  value,
  aiGenerated,
  generating,
  rows,
  onChange,
  onGenerate,
  textareaClassName = 'input-field flex-1 text-xs py-1.5 resize-y leading-snug',
}) => {
  const textarea = (
    <textarea
      placeholder="Remarks..."
      value={value}
      onChange={(e) => onChange(e.target.value)}
      rows={rows}
      className={textareaClassName}
    />
  );

  return (
    <div className="flex items-start gap-2 flex-1">
      {aiGenerated ? <AiGeneratedNotice className="flex-1">{textarea}</AiGeneratedNotice> : textarea}
      <button
        type="button"
        onClick={onGenerate}
        disabled={generating}
        title="AI Comment"
        className="p-2 rounded-xl bg-primary-50 hover:bg-primary-100 dark:bg-primary-600/20 text-primary-600 dark:text-primary-400 border border-primary-200 dark:border-primary-500/30 transition-colors flex-shrink-0"
      >
        {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
      </button>
    </div>
  );
};
