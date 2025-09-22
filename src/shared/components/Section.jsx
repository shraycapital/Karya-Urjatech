import React from 'react';

function Section({ title, children }) {
  return (
    <section className="card">
      <h3 className="section-title">{title}</h3>
      {children}
    </section>
  );
}

export default Section;


