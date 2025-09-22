import React from 'react';

export default function Tabs({ active, onChange, tabs }) {
  return (
    <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 z-40">
      <div className="flex justify-around items-center h-16 px-2">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => onChange(tab.key)}
            className={`flex flex-col items-center justify-center flex-1 h-full transition-colors ${
              active === tab.key ? 'text-brand-600 border-t-2 border-brand-600' : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            {tab.icon}
            <span className="text-xs font-medium">{tab.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}


