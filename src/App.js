import React, { Component } from "react";
import "./App.css";
import { Grid, Cell } from "styled-css-grid";
import Map from "./components/Map";
import ReviewSummary from "./components/ReviewSummary";
import BusinessSummary from "./components/BusinessSummary";
import CategorySummary from "./components/CategorySummary";
import { DateRangePicker } from "react-dates";
import neo4j from "neo4j-driver/lib/browser/neo4j-web";
import { Date } from "neo4j-driver/lib/v1/temporal-types";
import moment from "moment";

class App extends Component {
  constructor(props) {
    super(props);
    let focusedInput = null;

    this.state = {
      focusedInput,
      startDate: moment("2014-01-01"),
      endDate: moment("2018-01-01"),
      businesses: [],
      starsData: [],
      reviews: [{ day: "2018-01-01", value: 10 }],
      categoryData: [],
      selectedBusiness: false,
      mapCenter: {
        latitude: 33.33,
        longitude: -111.978,
        radius: 0.5,
        zoom: 16
      }
    };

    this.driver = neo4j.driver(
      //"bolt://localhost:7687",
      //neo4j.auth.basic("neo4j", "letmein")
      "bolt://reviews.lyonwj.com:17687",
      neo4j.auth.basic("reviews", "letmein"),
      { encrypted: true }
    );
    this.fetchBusinesses();
    this.fetchCategories();
    this.fetchReviews();
  }

  onDatesChange = ({ startDate, endDate }) => {
    if (startDate && endDate) {
      this.setState(
        {
          startDate,
          endDate
        },
        () => {
          this.fetchBusinesses();
          this.fetchReviews();
          this.fetchCategories();
        }
      );
    } else {
      this.setState({
        startDate,
        endDate
      });
    }
  };

  onFocusChange = focusedInput => this.setState({ focusedInput });

  businessSelected = b => {
    this.setState({
      selectedBusiness: b
    });
  };

  mapCenterChange = viewport => {
    this.setState({
      mapCenter: {
        ...this.state.mapCenter,
        latitude: viewport.latitude,
        longitude: viewport.longitude,
        zoom: viewport.zoom
      }
    });
  };

  fetchCategories = () => {
    const { mapCenter, startDate, endDate } = this.state;
    const session = this.driver.session();

    session
      .run(
        `MATCH (b:Business)<-[:REVIEWS]-(r:Review)
        WHERE $start <= r.date <= $end AND distance(b.location, point({latitude: $lat, longitude: $lon})) < ($radius * 1000)
        WITH r,b LIMIT 1000
        WITH DISTINCT b
    OPTIONAL MATCH (b)-[:IN_CATEGORY]->(c:Category)
    WITH c.name AS cat, COUNT(b) AS num ORDER BY num DESC LIMIT 25
    RETURN COLLECT({id: cat, label: cat, value: toFloat(num)}) AS categoryData
    `,
        {
          lat: mapCenter.latitude,
          lon: mapCenter.longitude,
          radius: mapCenter.radius,
          start: new Date(
            startDate.year(),
            startDate.month() + 1,
            startDate.date()
          ),
          end: new Date(endDate.year(), endDate.month() + 1, endDate.date())
        }
      )
      .then(result => {
        const categoryData = result.records[0].get("categoryData");
        console.log(categoryData);
        this.setState({
          categoryData
        });
        session.close();
      })
      .catch(e => {
        console.log(e);
        session.close();
      });
  };

  fetchBusinesses = () => {
    // Get businesses within range of center of map
    // TODO: draw circle on map
    // TODO: scale distance based on current map zoom

    const { mapCenter, startDate, endDate } = this.state;
    const session = this.driver.session();
    session
      .run(
        `
        MATCH (b:Business)<-[:REVIEWS]-(r:Review)
        WHERE $start <= r.date <= $end AND distance(b.location, point({latitude: $lat, longitude: $lon})) < ( $radius * 1000)
        WITH r,b LIMIT 1000
        OPTIONAL MATCH (b)-[:IN_CATEGORY]->(c:Category)
        WITH r,b, COLLECT(c.name) AS categories
        WITH COLLECT(DISTINCT b {.*, categories}) AS businesses, COLLECT(DISTINCT r) AS reviews
        UNWIND reviews AS r
        WITH businesses, r.stars AS stars, COUNT(r) AS num ORDER BY stars
        WITH businesses, COLLECT({stars: toString(stars), count:toFloat(num)}) AS starsData
        RETURN businesses, starsData`,
        {
          lat: mapCenter.latitude,
          lon: mapCenter.longitude,
          radius: mapCenter.radius,
          start: new Date(
            startDate.year(),
            startDate.month() + 1,
            startDate.date()
          ),
          end: new Date(endDate.year(), endDate.month() + 1, endDate.date())
        }
      )
      .then(result => {
        const record = result.records[0];
        const businesses = record.get("businesses");
        const starsData = record.get("starsData");

        this.setState({
          businesses,
          starsData
        });
        session.close();
      })
      .catch(e => {
        // TODO: handle errors.
        console.log(e);
        session.close();
      });
  };

  fetchReviews = () => {
    const { startDate, endDate, mapCenter } = this.state;

    const session = this.driver.session();

    session
      .run(
        `
          MATCH (b:Business)<-[:REVIEWS]-(r:Review)
          WHERE $start <= r.date <= $end AND distance(b.location, point({latitude: $lat, longitude: $lon})) < ( $radius * 1000)
          WITH r,b LIMIT 1000
          WITH r
          WITH r.date as date, COUNT(*) AS num ORDER BY date
           WITH date.year + "-" + date.month + "-" + date.day AS reviewDate, num
          RETURN COLLECT({day: reviewDate, value: toFloat(num)}) AS reviewData
          
        
          `,
        {
          lat: mapCenter.latitude,
          lon: mapCenter.longitude,
          radius: mapCenter.radius,
          start: new Date(
            startDate.year(),
            startDate.month() + 1,
            startDate.date()
          ),
          end: new Date(endDate.year(), endDate.month() + 1, endDate.date())
        }
      )
      .then(result => {
        console.log("got some reviews");
        console.log(result);
        let reviews = result.records[0].get("reviewData");
        console.log(reviews);

        this.setState({
          reviews
        });

        session.close();
      })
      .catch(e => {
        console.log(e);
        session.close();
      });
  };

  componentDidUpdate = (prevProps, prevState) => {
    if (
      this.state.mapCenter.latitude !== prevState.mapCenter.latitude ||
      this.state.mapCenter.longitude !== prevState.mapCenter.longitude
    ) {
      this.fetchBusinesses();
      this.fetchCategories();
      this.fetchReviews();
    }
    if (
      this.state.selectedBusiness &&
      (!prevState.selectedBusiness ||
        this.state.selectedBusiness.id !== prevState.selectedBusiness.id ||
        false ||
        false)
    ) {
      // business is selected
      // TODO: fetch related businesses
    }
  };

  handleSubmit = () => {};

  radiusChange = (e) => {
    this.setState({
      mapCenter: {
        ...this.state.mapCenter,
        radius: Number(e.target.value)
      }
    }, () => {
      this.fetchBusinesses();
    this.fetchCategories();
    this.fetchReviews();
    })
  }

  dateChange = (e) => {
    console.log(e.target.id);

  if (e.target.id === "timeframe-start") {
    this.setState({
      startDate: moment(e.target.value)
    }, () => {
      this.fetchBusinesses();
      this.fetchCategories();
      this.fetchReviews();
    })
  } else if (e.target.id === "timeframe-end") {
    this.setState({
      endDate: moment(e.target.value)
    }, () => {
      this.fetchBusinesses();
      this.fetchCategories();
      this.fetchReviews();
    })
  }
  }

  render() {
    return (
      <div id="app-wrapper">
        <div id="app-toolbar">
          <form action="" onSubmit={this.handleSubmit}>
            <div className="row tools">
              <div className="col-sm-2">
                <div className="tool radius">
                  <h5>Query Radius</h5>
                  <input
                    type="number"
                    id="radius-value"
                    className="form-control"
                    min="0.1"
                    step="0.1"
                    value={this.state.mapCenter.radius}
                    onChange={this.radiusChange}
                  />
                  <select className="form-control" id="radius-suffix">
                    <option value="km">km</option>
                  </select>
                </div>
              </div>

              <div className="col-sm-2">
                <div className="tool coordinates">
                  <h5>Latitude</h5>
                  <input
                    type="number"
                    step="any"
                    id="coordinates-lat"
                    className="form-control"
                    placeholder="Latitude"
                    value={this.state.mapCenter.latitude}
                  />
                </div>
              </div>

              <div className="col-sm-2">
                <div className="tool coordinates">
                  <h5>Longitude</h5>
                  <input
                    type="number"
                    step="any"
                    id="coordinates-lng"
                    className="form-control"
                    placeholder="Longitude"
                    value={this.state.mapCenter.longitude}
                  />
                </div>
              </div>

              <div className="col-sm-2">
                <div className="tool timeframe">
                  <h5>Start Date</h5>
                  <input
                    type="date"
                    id="timeframe-start"
                    className="form-control"
                    placeholder="mm/dd/yyyy"
                    value={this.state.startDate.format("YYYY-MM-DD")}
                    onChange={this.dateChange}
                  />
                </div>
              </div>

              <div className="col-sm-2">
                <div className="tool timeframe">
                  <h5>End Date</h5>
                  <input
                    type="date"
                    id="timeframe-end"
                    className="form-control"
                    placeholder="mm/dd/yyyy"
                    value={this.state.endDate.format("YYYY-MM-DD")}
                    onChange={this.dateChange}
                  />
                </div>
              </div>

              <div className="col-sm-2">
                <div className="tool">
                  <h5>SpaceTime Reviews</h5>
                  <button id="refresh" className="btn btn-primary btn-block">
                    Refresh
                  </button>
                </div>
              </div>
            </div>
          </form>
        </div>
        <div className="chart-wrapper">
        <div id="app-maparea">

          <Map
            mapCenterChange={this.mapCenterChange}
            mapCenter={this.state.mapCenter}
            businesses={this.state.businesses}
            businessSelected={this.businessSelected}
            selectedBusiness={this.state.selectedBusiness}
          />
          </div>
        </div>

        <div id="app-sidebar">
          {/* <div className="chart-wrapper">
            <div className="chart-title">Cell Title</div>
            <div className="chart-stage">
              {/* <DateRangePicker
                startDate={this.state.startDate} ///{this.state.startDate} // momentPropTypes.momentObj or null,
                startDateId="your_unique_start_date_id" // PropTypes.string.isRequired,
                endDate={this.state.endDate} //{this.state.endDate} // momentPropTypes.momentObj or null,
                endDateId="your_unique_end_date_id" // PropTypes.string.isRequired,
                onDatesChange={this.onDatesChange} // PropTypes.func.isRequired,
                focusedInput={this.state.focusedInput} //{this.state.focusedInput}//{this.state.focusedInput} // PropTypes.oneOf([START_DATE, END_DATE]) or null,
                onFocusChange={this.onFocusChange} // PropTypes.func.isRequired,
                isOutsideRange={day => false}
              /> 
            </div>
            <div className="chart-notes">Notes about this chart</div>
          </div> */}
          <br />
          <div id="chart-02">
            <div className="chart-wrapper">
              <div className="chart-title">Review Star Summary</div>
              <div className="chart-stage">
                <BusinessSummary
                  businesses={this.state.businesses}
                  starsData={this.state.starsData}
                />
              </div>
              <div className="chart-notes">Review stars for businesses in the selected radius and date range.</div>
            </div>
          </div>
          <br />
          <div id="chart-03">
            <div className="chart-wrapper">
              <div className="chart-title">Category Summary</div>
              <div className="chart-stage">
                <CategorySummary categoryData={this.state.categoryData} />
              </div>
              <div className="chart-notes">Business category breakdown for businesses in the selecte radius with reviews in the date range.</div>
            </div>
          </div>
        </div>
        {/* <ReviewSummary
              business={this.state.selectedBusiness}
              reviews={this.state.reviews}
              startDate={
                this.state.startDate &&
                this.state.startDate.format("YYYY-MM-DD")
              }
              endDate={
                this.state.endDate && this.state.endDate.format("YYYY-MM-DD")
              }
            /> */}
      </div>
    );
  }
}

export default App;
