import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Minus } from 'lucide-react';
import Footer from '../components/Footer';

const faqs: { category: string; items: { q: string; a: string }[] }[] = [
  {
    category: 'General',
    items: [
      {
        q: 'What is GradTrack?',
        a: 'GradTrack is Norzagaray College\'s official graduate tracer and survey management system. It allows the college to send tracer surveys to graduates and receive clear employment outcome data in one place. The system helps the institution measure program effectiveness and support accreditation reporting.\n\nSurveys can be customized per program or batch, and graduates can complete them online at any time — no paper forms or manual encoding required.',
      },
      {
        q: 'Who can use GradTrack?',
        a: 'GradTrack is used by three groups: Graduates (to complete tracer surveys and submit employment information), Administrators such as the Registrar and Super Admin (to manage graduates, create surveys, and view reports), and Deans (to monitor survey completion and graduate outcomes for their specific college and programs).',
      },
      {
        q: 'Is GradTrack the same as a regular survey tool like Google Forms?',
        a: 'No. Unlike generic survey tools, GradTrack is purpose-built for graduate tracer studies. It automatically links survey responses to graduate profiles, tracks course-to-career alignment, and generates employment reports per program — features that general survey tools do not provide.',
      },
      {
        q: 'How user-friendly is GradTrack for graduates and administrators?',
        a: 'GradTrack is designed to be simple for both sides. Graduates only need to access the survey link from the homepage and fill out the form — no account creation required. Administrators have a dedicated dashboard with clear navigation for managing graduates, surveys, and reports.',
      },
    ],
  },
  {
    category: 'Surveys',
    items: [
      {
        q: 'How does a graduate complete a tracer survey?',
        a: 'Graduates visit the GradTrack homepage and click "Take Survey." They fill out the survey form which includes questions about their employment status, job title, company, industry, and how their job relates to their degree program. Once submitted, the response is saved and linked to their graduate profile.',
      },
      {
        q: 'Can a graduate submit the survey more than once?',
        a: 'Each survey is designed to be completed once per graduate per survey period. The system tracks which graduates have already responded to prevent duplicate submissions.',
      },
      {
        q: 'What types of questions are in the tracer survey?',
        a: 'The tracer survey includes various question types such as text fields, multiple choice, radio buttons, dropdowns, and date fields. Admins can customize the survey questions to gather the specific information the college needs.',
      },
    ],
  },
  {
    category: 'Data & Reports',
    items: [
      {
        q: 'What kind of reports can administrators generate?',
        a: 'Administrators can generate reports on graduate employment rates, industry distribution, course-to-career alignment percentages, and survey response rates — all filterable by program, batch year, or college.',
      },
      {
        q: 'What is course-career alignment?',
        a: 'Course-career alignment measures whether a graduate\'s current job is related to the degree program they completed at Norzagaray College. GradTrack automatically analyzes this based on the graduate\'s submitted job information and their enrolled program.',
      },
      {
        q: 'Is graduate data kept private and secure?',
        a: 'Yes. Graduate data is only accessible to authorized users based on their role. Deans can only view data for their own college, Registrars manage graduate records, and Super Admins have full system access. Graduates\' personal information is not publicly visible.',
      },
    ],
  },
];

function AccordionItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex justify-between items-center px-6 py-5 text-left hover:bg-gray-50 transition"
      >
        <span className="text-blue-900 font-semibold text-lg">{q}</span>
        <span className="flex-shrink-0 ml-4 w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center">
          {open ? <Minus className="w-4 h-4 text-blue-900" /> : <Plus className="w-4 h-4 text-blue-900" />}
        </span>
      </button>
      {open && (
        <div className="px-6 pb-6 pl-16">
          {a.split('\n\n').map((para, i) => (
            <p key={i} className="text-gray-600 leading-relaxed mb-3 last:mb-0">{para}</p>
          ))}
        </div>
      )}
    </div>
  );
}

export default function FAQPage() {
  return (
    <div className="min-h-screen bg-white">

      {/* Nav */}
      <nav className="bg-blue-900/95 backdrop-blur-sm shadow-lg sticky top-0 z-50">
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-20">
            <Link to="/" className="flex items-center space-x-4">
              <img src="/Gradtrack_small.png" alt="GradTrack" className="h-16 w-16 object-contain" />
              <div>
                <h1 className="text-xl font-bold text-white">GradTrack</h1>
                <p className="text-sm text-blue-100">Graduate Tracer System</p>
              </div>
            </Link>
            <div className="flex items-center space-x-6">
              <Link to="/about" className="text-white hover:text-yellow-400 font-medium transition">About</Link>
              <Link to="/#why-gradtrack" className="text-white hover:text-yellow-400 font-medium transition">Features</Link>
              <Link to="/faq" className="text-yellow-400 font-medium">FAQ's</Link>
              <Link to="/survey" className="bg-yellow-500 hover:bg-yellow-600 text-blue-900 px-6 py-2.5 rounded-lg font-medium transition shadow-md">
                Take Survey
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="bg-gradient-to-br from-blue-900 via-blue-800 to-blue-700 py-16">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <h1 className="text-5xl font-extrabold text-white mb-4">Frequently Asked Questions</h1>
          <p className="text-blue-200 text-xl">Everything you need to know about GradTrack.</p>
        </div>
      </section>

      {/* FAQ Sections */}
      <section className="bg-gray-50 py-16">
        <div className="max-w-4xl mx-auto px-6 space-y-14">
          {faqs.map((section) => (
            <div key={section.category}>
              <h2 className="text-3xl font-bold text-blue-900 mb-6">{section.category}</h2>
              <div className="space-y-3">
                {section.items.map((item) => (
                  <AccordionItem key={item.q} q={item.q} a={item.a} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="py-14 bg-yellow-500">
        <div className="max-w-3xl mx-auto px-6 text-center">
          <h2 className="text-2xl font-bold text-blue-900 mb-3">Still have questions?</h2>
          <p className="text-blue-800 mb-6">Reach out to Norzagaray College at <span className="font-semibold">norzagaraycollege2007@gmail.com</span></p>
          <Link to="/survey" className="bg-blue-900 hover:bg-blue-800 text-white px-10 py-4 rounded-lg font-bold text-lg transition shadow-lg">
            Take the Survey
          </Link>
        </div>
      </section>

      <Footer />
    </div>
  );
}
