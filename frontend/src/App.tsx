import { useState } from "react";
import { API_URL } from "./services/api";

export interface PublicSchool {
  slug: string;
  school_name: string;
  tagline: string;
  description: string;
  address: string;
  phone: string;
  email: string;
  website: string;
  logo_url: string;
}

export interface PublicGalleryItem {
  image_url: string;
  caption: string;
}

export interface PublicAnnouncement {
  id: number;
  title: string;
  message: string;
  created_at: string;
  display_date: string | null;
}
import "./App.css";

function App({ school, gallery = [], notices = [] }: {
  school?: PublicSchool;
  gallery?: PublicGalleryItem[];
  notices?: PublicAnnouncement[];
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const schoolName = school?.school_name?.trim() || "YOUR SCHOOL";
  const schoolTagline = school?.tagline?.trim() || "KNOWLEDGE • CHARACTER • FUTURE";
  const assetUrl = (url: string) =>
    /^https?:\/\//i.test(url)
      ? url
      : `${API_URL}${url.startsWith("/") ? "" : "/"}${url}`;

  const closeMenu = () => setMenuOpen(false);

  const programs = [
    { icon: "📚", title: "Foundational Learning", detail: "Nursery – Class II", color: "peach" },
    { icon: "🔬", title: "Preparatory School", detail: "Classes III – V", color: "blue" },
    { icon: "🧮", title: "Middle School", detail: "Classes VI – VIII", color: "green" },
    { icon: "🎓", title: "Secondary School", detail: "Classes IX – XII", color: "lavender" },
  ];

  const facilities = [
    { icon: "🧪", title: "Science Laboratories", text: "Learn by exploring, experimenting and discovering." },
    { icon: "📖", title: "Library & Reading", text: "A welcoming space for curiosity and lifelong learning." },
    { icon: "💻", title: "Digital Learning", text: "Technology-supported learning for a changing world." },
    { icon: "⚽", title: "Sports & Activities", text: "Build teamwork, confidence and a healthy spirit." },
  ];

  return (
    <div className="site-shell">
      <div className="top-strip">
        <div className="container top-strip-inner">
          <span>✦ {'LEARN • GROW • EXCEL'}</span>
          <div className="top-links">
            <a href="#contact">{'Contact Us'}</a>
            <span className="top-divider">|</span>
            <a href="#notices">{'Latest Notices'}</a>
          </div>
        </div>
      </div>

      <header className="main-header">
        <div className="container nav-inner">
          <a href="#home" className="brand" onClick={closeMenu}>
            {school?.logo_url ? <img className="brand-logo" src={assetUrl(school.logo_url)} alt={`${schoolName} logo`} /> : <div className="brand-mark"><span>✦</span><small>EDU</small></div>}
            <div className="brand-copy">
              <strong>{schoolName}</strong>
              <span>{schoolTagline.toUpperCase()}</span>
            </div>
          </a>

          <button
            className="mobile-menu-button"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="Toggle navigation"
            aria-expanded={menuOpen}
          >
            {menuOpen ? "✕" : "☰"}
          </button>

          <nav className={menuOpen ? "nav-links nav-open" : "nav-links"}>
            <a href="#home" onClick={closeMenu}>{'Home'}</a>
            <a href="#about" onClick={closeMenu}>{'About'}</a>
            <a href="#academics" onClick={closeMenu}>{'Academics'}</a>
            <a href="#facilities" onClick={closeMenu}>{'Facilities'}</a>
            <a href="#notices" onClick={closeMenu}>{'Notices'}</a>
            <a className="nav-cta" href="#admissions" onClick={closeMenu}>
              {'Admissions ↗'}
            </a>
          </nav>
        </div>
      </header>

      <main>
        <section className={school ? "hero hero-school" : "hero"} id="home">
          <div className="hero-orb orb-one" />
          <div className="hero-orb orb-two" />
          <div className="container hero-grid">
            <div className="hero-content">
              <div className="eyebrow"><span className="eyebrow-dot" /> {'A BETTER FUTURE STARTS HERE'}</div>
              <h1>{school ? <>Welcome to<br /><span>{schoolName}</span></> : <>Every child has<br />a world of <span>possibility</span><br />within.</>}</h1>
              <p className="hero-description">{school ? schoolTagline : ('We create an environment where young minds discover their strengths, build character and gain the confidence to shape tomorrow.')}</p>
              <div className="hero-actions">
                <a className="button button-primary" href="#admissions">{'Explore Admissions'} <span>↗</span></a>
                <a className="button button-outline" href="#about"><span className="play-icon">▶</span> {'Discover Our School'}</a>
              </div>
              <div className="hero-trust">
                <div className="trust-avatars"><span>👩🏻‍🏫</span><span>👨🏽‍🎓</span><span>👩🏽‍🎓</span></div>
                <div><strong>A community that cares</strong><small>{'Every student matters, every day.'}</small></div>
              </div>
            </div>

            <div className="hero-art" aria-label="Illustration of a school campus">
              <div className="art-sun" />
              <div className="art-label label-top"><span>✦</span><div><strong>Curiosity first</strong><small>Learning for life</small></div></div>
              <div className="campus-card">
                <div className="campus-sky">
                  <div className="cloud cloud-one" /><div className="cloud cloud-two" />
                  <div className="school-building">
                    <div className="building-roof" />
                    <div className="building-main">
                      <div className="building-sign">{schoolName}</div>
                      <div className="building-windows"><i /><i /><i /></div>
                      <div className="building-door" />
                      <div className="building-windows bottom-windows"><i /><i /><i /></div>
                    </div>
                    <div className="building-wing wing-left"><i /><i /></div>
                    <div className="building-wing wing-right"><i /><i /></div>
                  </div>
                  <div className="tree tree-left"><i /><b /></div>
                  <div className="tree tree-right"><i /><b /></div>
                  <div className="campus-ground" />
                  <div className="pathway" />
                </div>
                <div className="campus-caption"><span className="caption-star">✳</span><div><strong>A place to belong</strong><small>Growing together, every day</small></div><span className="caption-arrow">↗</span></div>
              </div>
              <div className="art-label label-bottom"><span>✎</span><div><strong>Beyond textbooks</strong><small>Skills. Values. Confidence.</small></div></div>
              <div className="floating-spark spark-one">✳</div>
              <div className="floating-spark spark-two">✦</div>
            </div>
          </div>
          <div className="hero-bottom container">
            <span>01 — 04</span><div className="hero-progress"><i /></div><span>{'PREPARING FOR TOMORROW'}</span>
          </div>
        </section>

{!school && (
        <section className="stats-section">
          <div className="container stats-grid">
            <div className="stat-intro"><span className="section-kicker">OUR SCHOOL AT A GLANCE</span><p>{'A community built around the potential of every learner.'}</p></div>
            <div className="stat-item"><strong>XX<span>+</span></strong><small>Years of Learning</small></div>
            <div className="stat-item"><strong>XXX<span>+</span></strong><small>Happy Students</small></div>
            <div className="stat-item"><strong>XX<span>+</span></strong><small>Dedicated Educators</small></div>
          </div>
          <p className="stats-note container">* Replace these sample figures with your school's verified information.</p>
        </section>
        )}

<section className="section about-section" id="about">
          <div className="container about-grid">
            <div className="about-visual">
              <div className="about-image-block"><div className="about-image-sun" /><div className="book-illustration"><span>✦</span><div>KNOWLEDGE<br />OPENS DOORS</div></div><div className="pencil-illustration">✎</div><div className="plant-illustration">❋</div></div>
              <div className="about-note"><span>✦</span><div><strong>Learning with purpose</strong><small>Building tomorrow, today.</small></div></div>
            </div>
            <div className="about-copy">
              <span className="section-kicker">{`WELCOME TO ${schoolName}`}</span>
              <h2>More than a school.<br /><span>A place to become.</span></h2>
              <p className="section-description">{school?.description?.trim() || "Education is not just about what students know. It is about who they become. We bring together thoughtful teaching, meaningful experiences and a caring community to help every learner find their path."}</p>
              <div className="value-list">
                <div><span className="value-icon">✦</span><div><strong>Purposeful learning</strong><p>Strong foundations and a love for discovery.</p></div></div>
                <div><span className="value-icon">♡</span><div><strong>Character & values</strong><p>Respect, responsibility and kindness in action.</p></div></div>
                <div><span className="value-icon">↗</span><div><strong>Individual growth</strong><p>Helping every student progress with confidence.</p></div></div>
              </div>
              <a className="text-link" href="#principal">Discover our philosophy <span>→</span></a>
            </div>
          </div>
        </section>

        <section className="principal-section" id="principal">
          <div className="container principal-inner">
            <div className="principal-symbol">“</div>
            <div className="principal-copy">
              <span className="section-kicker">A MESSAGE FROM THE PRINCIPAL</span>
              <h2>Every great journey begins<br />with <span>one small step.</span></h2>
              <p>Our commitment is to create a school where every child feels seen, supported and inspired to learn. Together with families, we aim to nurture curious minds, compassionate hearts and responsible citizens.</p>
              <div className="principal-signature"><div className="signature-avatar">P</div><div><strong>School Administration</strong><small>School, {schoolName}</small></div></div>
            </div>
            <div className="principal-decoration"><div className="deco-circle"><span>✦</span><strong>INSPIRE</strong><small>GROW · ACHIEVE</small></div><div className="deco-line" /></div>
          </div>
        </section>

        <section className="section academics-section" id="academics">
          <div className="container">
            <div className="section-heading">
              <div><span className="section-kicker">LEARNING JOURNEY</span><h2>Every stage, <span>full of possibility.</span></h2></div>
              <p>Thoughtfully designed learning experiences that grow with your child, from first discoveries to future ambitions.</p>
            </div>
            <div className="program-grid">
              {programs.map((program, index) => (
                <article className="program-card" key={program.title}>
                  <div className={`program-icon ${program.color}`}>{program.icon}</div>
                  <span className="program-number">0{index + 1}</span>
                  <h3>{program.title}</h3><p>{program.detail}</p>
                  <a href="#contact" aria-label={`Ask about ${program.title}`}>Learn more <span>↗</span></a>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="section facilities-section" id="facilities">
          <div className="container">
            <div className="section-heading">
              <div><span className="section-kicker">A PLACE TO THRIVE</span><h2>Room to explore.<br /><span>Space to grow.</span></h2></div>
              <p>Learning happens everywhere. Our facilities and activities support curiosity, creativity, wellbeing and the joy of discovery.</p>
            </div>
            <div className="facility-grid">
              {facilities.map((facility, index) => (
                <article className="facility-card" key={facility.title}>
                  <div className="facility-icon">{facility.icon}</div><span className="facility-number">0{index + 1}</span>
                  <h3>{facility.title}</h3><p>{facility.text}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {!school ? (
<section className="notices-section section" id="notices">
          <div className="container notices-grid">
            <div className="notices-intro"><span className="section-kicker">STAY IN THE LOOP</span><h2>What's happening<br /><span>at our school.</span></h2><p>Keep up with important dates, school updates and upcoming events.</p><a className="text-link" href="#contact">All school updates <span>→</span></a></div>
            <div className="notice-list">
              <article className="notice-item"><div className="notice-date"><strong>01</strong><span>UPDATE</span></div><div className="notice-content"><span className="notice-tag">SCHOOL NEWS</span><h3>Welcome to our school website</h3><p>Find school information, learning updates and contact details here.</p></div><span className="notice-arrow">↗</span></article>
              <article className="notice-item"><div className="notice-date"><strong>02</strong><span>NOTICE</span></div><div className="notice-content"><span className="notice-tag">ADMISSIONS</span><h3>Admissions information</h3><p>Contact the school office for the current admission process and dates.</p></div><span className="notice-arrow">↗</span></article>
              <article className="notice-item"><div className="notice-date"><strong>03</strong><span>EVENT</span></div><div className="notice-content"><span className="notice-tag">UPCOMING EVENTS</span><h3>School events & activities</h3><p>Watch this space for verified announcements and school activities.</p></div><span className="notice-arrow">↗</span></article>
              <p className="sample-notice">Sample content only. Replace with approved school notices before publishing.</p>
            </div>
          </div>
        </section>
) : (
<section className="notices-section section" id="notices">
  <div className="container notices-grid">
    <div className="notices-intro">
      <span className="section-kicker">SCHOOL NOTICES</span>
      <h2>School notices<br /><span>and updates.</span></h2>
      <p>Check back here for verified school announcements.</p>
    </div>
    <div className="notice-list">
      {notices.length === 0 ? (
        <p className="notice-empty">No school notices have been published yet.</p>
      ) : (
        notices.map((notice) => {
          const dateValue = notice.display_date || notice.created_at.slice(0, 10);
          const [year, month, day] = dateValue.split("-").map(Number);
          const noticeDate = new Date(year, month - 1, day);
          return (
            <article className="notice-item" key={notice.id}>
              <div className="notice-date">
                <strong>{noticeDate.getDate().toString().padStart(2, "0")}</strong>
                <span>{noticeDate.toLocaleDateString("en-IN", { month: "short", year: "numeric" })}</span>
              </div>
              <div className="notice-content">
                <span className="notice-tag">SCHOOL NOTICE</span>
                <h3>{notice.title}</h3>
                <p>{notice.message}</p>
              </div>
            </article>
          );
        })
      )}
    </div>
  </div>
</section>
)}


        {school && gallery.length > 0 && (
          <section className="section school-gallery-section" id="gallery">
            <div className="container">
              <div className="section-heading">
                <div>
                  <span className="section-kicker">SCHOOL GALLERY</span>
                  <h2>Life at <span>{schoolName}.</span></h2>
                </div>
                <p>Explore moments shared by our school community.</p>
              </div>
              <div className="school-gallery-grid">
                {gallery.map((item, index) => (
                  <figure className="school-gallery-card" key={`${item.image_url}-${index}`}>
                    <img
                      src={assetUrl(item.image_url)}
                      alt={item.caption || `${schoolName} gallery image ${index + 1}`}
                      loading="lazy"
                    />
                    {item.caption && <figcaption>{item.caption}</figcaption>}
                  </figure>
                ))}
              </div>
            </div>
          </section>
        )}

        <section className="admissions-section" id="admissions">
          <div className="container admissions-inner">
            <div><span className="section-kicker">YOUR NEXT CHAPTER STARTS HERE</span><h2>Let's make room for<br /><span>what's possible.</span></h2><p>Have questions about admissions? Our school team is here to help you take the next step.</p></div>
            <div className="admissions-actions"><a className="button button-light" href="#contact">Enquire About Admissions <span>↗</span></a><a className="admissions-phone" href="#contact">Contact the school office <span>→</span></a></div>
            <div className="admissions-star">✳</div>
          </div>
        </section>

        <section className="contact-section section" id="contact">
          <div className="container contact-grid">
            <div><span className="section-kicker">WE'D LOVE TO HEAR FROM YOU</span><h2>Let's start<br /><span>a conversation.</span></h2><p>Reach out to our school office for admissions, school information or general enquiries.</p></div>
            <div className="contact-details">
              <div className="contact-row"><span className="contact-icon">⌖</span><div><small>VISIT US</small><strong>{school?.address || (school ? 'Address not provided' : 'Your School Address, City, State')}</strong></div></div>
              <div className="contact-row"><span className="contact-icon">☎</span><div><small>CALL THE OFFICE</small><strong>{school?.phone || (school ? 'Phone not provided' : '+91 XXXXX XXXXX')}</strong></div></div>
              <div className="contact-row"><span className="contact-icon">✉</span><div><small>EMAIL</small><strong>{school?.email || (school ? 'Email not provided' : 'info@yourschool.edu.in')}</strong></div></div>
              <div className="contact-row"><span className="contact-icon">◷</span><div><small>OFFICE HOURS</small><strong>Monday – Saturday · 9 AM – 3 PM</strong></div></div>
              {!school && <p className="sample-notice">Replace sample contact details with the school's verified information.</p>}
            </div>
          </div>
        </section>
      </main>

      <footer className="footer">
        <div className="container footer-main">
          <a href="#home" className="brand footer-brand">{school?.logo_url ? <img className="brand-logo" src={assetUrl(school.logo_url)} alt={`${schoolName} logo`} /> : <div className="brand-mark"><span>✦</span><small>EDU</small></div>}<div className="brand-copy"><strong>{schoolName}</strong><span>{schoolTagline.toUpperCase()}</span></div></a>
          <p>Helping every learner discover their potential and shape a brighter tomorrow.</p>
          <div className="footer-links"><a href="#about">About</a><a href="#academics">Academics</a><a href="#admissions">Admissions</a><a href="#contact">Contact</a><a href="/login">Staff Login</a></div>
        </div>
        <div className="container footer-bottom"><span>© {new Date().getFullYear()} {schoolName}. All rights reserved.</span><span>Made for learning. Built for tomorrow. ✦</span></div>
      </footer>
    </div>
  );
}

export default App;
