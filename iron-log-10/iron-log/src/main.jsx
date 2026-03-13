import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'

class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  componentDidCatch(error) { this.setState({ error }); }
  render() {
    if (this.state.error) return (
      <div style={{ padding: 24, fontFamily: 'monospace', background: '#fff5f5', minHeight: '100vh' }}>
        <h2 style={{ color: '#e53e3e' }}>Ошибка приложения</h2>
        <pre style={{ whiteSpace: 'pre-wrap', fontSize: 13, color: '#333', marginTop: 16 }}>
          {this.state.error.toString()}
          {'\n\n'}
          {this.state.error.stack}
        </pre>
      </div>
    );
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
)
