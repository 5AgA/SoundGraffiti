import "./LandingPage.css";

function LandingPage({ exiting = false, hideImage = false, moving = false }) {
  return (
    <section className={`landing-wrap${moving ? " is-moving" : ""}`}>
      <div className="landing-copy">
        <p>Sound Graffiti</p>
        <p>: Tag Your Sound on the Map</p>
      </div>
    </section>
  );
}

export default LandingPage;
