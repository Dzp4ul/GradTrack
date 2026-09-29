export interface JobProgramOption {
  id: number;
  code: string;
  name: string;
}

interface JobProgramFitPickerProps {
  id: string;
  value: string;
  programs: JobProgramOption[];
  onChange: (value: string) => void;
  label?: string;
}

const splitProgramFit = (value: string) => value
  .split(/[,;|&/\n]+/)
  .map((item) => item.trim())
  .filter(Boolean);

export default function JobProgramFitPicker({
  id,
  value,
  programs,
  onChange,
  label = 'Course / Program Fit',
}: JobProgramFitPickerProps) {
  const values = splitProgramFit(value);
  const selectedCodes = new Set(values.map((item) => item.toLocaleLowerCase()));

  const toggleProgram = (code: string) => {
    const normalizedCode = code.toLocaleLowerCase();
    const nextValues = selectedCodes.has(normalizedCode)
      ? values.filter((item) => item.toLocaleLowerCase() !== normalizedCode)
      : [...values, code];
    onChange(nextValues.join(', '));
  };

  return (
    <fieldset className="min-w-0">
      <legend className="text-sm font-bold text-slate-700 dark:text-slate-200">{label}</legend>
      {programs.length > 0 && (
        <div className="mt-2 grid max-h-40 grid-cols-2 gap-2 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-3 dark:border-slate-700 dark:bg-slate-950/50">
          {programs.map((program) => {
            const checked = selectedCodes.has(program.code.toLocaleLowerCase());
            return (
              <label
                key={program.id || program.code}
                title={program.name}
                className={`flex cursor-pointer items-center gap-2 rounded-lg border px-2.5 py-2 text-xs font-semibold transition ${checked ? 'border-blue-300 bg-blue-50 text-blue-800 dark:border-blue-500/60 dark:bg-blue-950/50 dark:text-blue-200' : 'border-slate-200 bg-white text-slate-600 hover:border-blue-200 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300'}`}
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleProgram(program.code)}
                  className="h-4 w-4 rounded border-slate-300 text-blue-700 focus:ring-blue-500"
                />
                <span className="truncate">{program.code}</span>
              </label>
            );
          })}
        </div>
      )}
      <textarea
        id={id}
        rows={3}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Select programs above or enter eligibility such as Open to all graduates"
        className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
      />
      <p className="mt-1.5 text-xs font-normal leading-5 text-slate-500 dark:text-slate-400">All active GradTrack programs are available even when they have no current job posts.</p>
    </fieldset>
  );
}
