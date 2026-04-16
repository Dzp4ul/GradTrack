import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, Minus } from 'lucide-react';
import Footer from '../components/Footer';
import PublicNav from '../components/PublicNav';

const faqs: { category: string; items: { q: string; a: string }[] }[] = [
  {
    category: 'General',
    items: [
      {
        q: 'What is GradTrack?',
        a: 'GradTrack is Norzagaray College\'s graduate tracer and alumni engagement system. It helps the college collect verified tracer survey responses, organize graduate records, generate outcome reports, and support graduates through mentorship and job opportunities.\n\nThe system keeps survey data, graduate profiles, analytics, reports, mentor profiles, and job posts in one connected platform.',
      },
      {
        q: 'Who can use GradTrack?',
        a: 'Norzagaray College graduates can use GradTrack to answer tracer surveys, create a Graduate Portal account, update their profile, find mentors, request mentorship, and browse job opportunities.\n\nAuthorized college personnel use GradTrack to manage surveys, monitor graduate participation, review mentor and job submissions, and generate reports for planning and accreditation needs.',
      },
      {
        q: 'Do graduates need an account before taking the survey?',
        a: 'No. Graduates can start by clicking "Take Survey" and verifying their identity using their student number or email. After submitting the survey, they can create a GradTrack account to access the Graduate Portal.',
      },
      {
        q: 'Is GradTrack the same as a regular survey tool?',
        a: 'No. GradTrack is built specifically for graduate tracer activities. It verifies graduates before they answer, connects responses to graduate records, tracks completion, analyzes employment and course-career alignment, and extends the survey into a Graduate Portal for mentorship and job opportunities.',
      },
    ],
  },
  {
    category: 'Surveys',
    items: [
      {
        q: 'How does a graduate complete a tracer survey?',
        a: 'Graduates click "Take Survey" on the homepage, verify their identity, and answer the active tracer survey online. The survey may include profile details, educational background, trainings, employment status, job details, salary range, course relevance, and feedback.',
      },
      {
        q: 'Can a graduate submit the survey more than once?',
        a: 'Each active survey is designed to be submitted once per verified graduate. GradTrack checks the graduate record and survey response status to help prevent duplicate submissions.',
      },
      {
        q: 'What happens after the survey is submitted?',
        a: 'The response is saved and linked to the verified graduate record. GradTrack then offers the graduate the option to create an account using the information already provided, so they can continue into the Graduate Portal.',
      },
      {
        q: 'Can survey questions be customized?',
        a: 'Yes. The survey can include sections and different question types such as text, multiple choice, radio buttons, checkboxes, and date fields. Saved survey responses can also be reviewed through analytics and reports.',
      },
    ],
  },
  {
    category: 'Graduate Portal',
    items: [
      {
        q: 'What can graduates do in the Graduate Portal?',
        a: 'Graduates can update their profile, browse approved mentors, send mentorship requests when eligible, browse approved job opportunities, and manage their own mentor profile or job posts if they meet the requirements.',
      },
      {
        q: 'Why are some portal features locked?',
        a: 'GradTrack unlocks some features based on survey information. Job posting is available to graduates marked as employed. Mentor profile creation requires employed status and course-career alignment. Mentorship requests are available for graduates marked as not employed.',
      },
      {
        q: 'How do mentor profiles and job posts appear in the portal?',
        a: 'Graduates can submit mentor profiles or job posts from the portal. New or updated submissions are reviewed first, and only approved active items appear in Find Mentors or Browse Jobs.',
      },
      {
        q: 'Can graduates leave feedback after mentorship?',
        a: 'Yes. Mentorship requests can be accepted, scheduled, completed, or cancelled. Graduates can leave mentor feedback, and mentors can also submit session remarks after a mentorship activity.',
      },
    ],
  },
  {
    category: 'Data & Reports',
    items: [
      {
        q: 'What reports can GradTrack generate?',
        a: 'GradTrack can produce reports for survey participation, response rates, employment status, program and year trends, salary distribution, and course-career alignment. Reports can support academic planning, accreditation, and graduate outcome review.',
      },
      {
        q: 'What is course-career alignment?',
        a: 'Course-career alignment checks whether a graduate\'s work is related to the program they completed. This helps the college understand how well academic programs connect to actual career paths.',
      },
      {
        q: 'Is graduate data kept private?',
        a: 'Yes. Graduate records and survey responses are used for official Norzagaray College tracer, reporting, and alumni engagement purposes. Personal information is not publicly visible, and portal items such as mentor profiles or job posts appear only after review and approval.',
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
        className="w-full flex justify-between items-center gap-3 px-4 py-4 text-left hover:bg-gray-50 transition sm:px-6 sm:py-5"
      >
        <span className="text-blue-900 font-semibold text-base sm:text-lg">{q}</span>
        <span className="flex-shrink-0 w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center">
          {open ? <Minus className="w-4 h-4 text-blue-900" /> : <Plus className="w-4 h-4 text-blue-900" />}
        </span>
      </button>
      {open && (
        <div className="px-4 pb-5 sm:px-6 sm:pb-6 sm:pl-16">
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
    <div className="min-h-screen overflow-x-hidden bg-white">

      {/* Nav */}
      <PublicNav active="faq" />

      {/* Hero */}
      <section className="bg-gradient-to-br from-blue-900 via-blue-800 to-blue-700 py-12 sm:py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 text-center">
          <h1 className="text-3xl sm:text-5xl font-extrabold text-white mb-4">Frequently Asked Questions</h1>
          <p className="text-blue-200 text-base sm:text-xl">Everything you need to know about GradTrack.</p>
        </div>
      </section>

      {/* FAQ Sections */}
      <section className="bg-gray-50 py-12 sm:py-16">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 space-y-10 sm:space-y-14">
          {faqs.map((section) => (
            <div key={section.category}>
              <h2 className="text-2xl sm:text-3xl font-bold text-blue-900 mb-6">{section.category}</h2>
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
      <section className="py-12 sm:py-14 bg-yellow-500">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 text-center">
          <h2 className="text-2xl font-bold text-blue-900 mb-3">Still have questions?</h2>
          <p className="text-blue-800 mb-6">Reach out to Norzagaray College at <span className="font-semibold">norzagaraycollege2007@gmail.com</span></p>
          <Link to="/survey" className="inline-block w-full bg-blue-900 hover:bg-blue-800 text-white px-10 py-4 rounded-lg font-bold text-base sm:text-lg transition shadow-lg sm:w-auto">
            Take the Survey
          </Link>
        </div>
      </section>

      <Footer />
    </div>
  );
}
