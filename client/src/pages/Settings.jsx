import { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { api } from '../services/api';

export default function Settings() {
  const { addToast, settings, loadSettings } = useApp();
  const [form, setForm] = useState({
    telegramBotToken: '',
    telegramChatId: '',
    scrapeIntervalMs: 300000,
    minPrice: '',
    maxPrice: '',
    keywordBlacklist: '',
    facebookCookies: '',
  });
  const [saving, setSaving] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (settings) {
      setForm(prev => ({
        ...prev,
        scrapeIntervalMs: settings.scrapeIntervalMs || 300000,
        ...settings,
      }));
      setLoaded(true);
    }
  }, [settings]);

  function updateField(field, value) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  async function handleSave(e) {
    e.preventDefault();
    setSaving(true);
    try {
      await api.saveSettings(form);
      await loadSettings();
      addToast('Settings saved successfully', 'success');
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="page">
      <div className="main-header">
        <h2>Settings</h2>
        <p>Configure your OfferUp scraper</p>
      </div>

      <form onSubmit={handleSave} className="settings-form">
        <section className="settings-section">
          <h3>🔔 Telegram Notifications</h3>
          <p className="section-desc">Get alerts when new listings are found during auto-scrape.</p>
          <div className="form-group">
            <label>Bot Token</label>
            <input
              type="text"
              value={form.telegramBotToken || ''}
              onChange={e => updateField('telegramBotToken', e.target.value)}
              placeholder="123456:ABC-DEF1234ghikl..."
              className="url-input"
            />
            <span className="form-hint">Get this from @BotFather on Telegram</span>
          </div>
          <div className="form-group">
            <label>Chat ID</label>
            <input
              type="text"
              value={form.telegramChatId || ''}
              onChange={e => updateField('telegramChatId', e.target.value)}
              placeholder="123456789"
              className="url-input"
            />
            <span className="form-hint">Your Telegram user or group chat ID</span>
          </div>
          <div className={`config-status${form.telegramBotToken && form.telegramChatId ? ' config-ok' : ''}`}>
            {form.telegramBotToken && form.telegramChatId
              ? '✅ Telegram is configured'
              : '⚠️ Telegram is not fully configured'}
          </div>
        </section>

        <section className="settings-section">
          <h3>⏱️ Scraping Defaults</h3>
          <div className="form-group">
            <label>Scrape Interval (ms)</label>
            <input
              type="number"
              value={form.scrapeIntervalMs}
              onChange={e => updateField('scrapeIntervalMs', parseInt(e.target.value) || 300000)}
              className="url-input"
            />
            <span className="form-hint">{Math.round(form.scrapeIntervalMs / 1000)}s = {Math.round(form.scrapeIntervalMs / 60000)}min</span>
          </div>
        </section>

        <section className="settings-section">
          <h3>🍪 Facebook Authentication</h3>
          <p className="section-desc">
            Paste your Facebook cookies as a JSON array to bypass the login wall when scraping Marketplace.
            <br />
            <strong>How to get cookies:</strong> Open DevTools in Chrome → Application → Cookies → facebook.com →
            export all cookies, then copy as JSON array with <code>name</code>, <code>value</code>, <code>domain</code> fields.
          </p>
          <div className="form-group">
            <label>Cookie JSON</label>
            <textarea
              value={form.facebookCookies || ''}
              onChange={e => updateField('facebookCookies', e.target.value)}
              placeholder='[{"name": "c_user", "value": "...", "domain": ".facebook.com"}, {"name": "xs", "value": "...", "domain": ".facebook.com"}]'
              className="cookies-textarea"
              rows={6}
            />
            <span className="form-hint">
              Required cookies: <strong>c_user</strong>, <strong>xs</strong>. Also helpful: datr, fr, sb.
              These cookies are stored locally and never sent anywhere except to Facebook.
            </span>
          </div>
          <div className={`config-status${form.facebookCookies && form.facebookCookies.length > 10 ? ' config-ok' : ''}`}>
            {form.facebookCookies && form.facebookCookies.length > 10
              ? '✅ Facebook cookies are configured'
              : '⚠️ Facebook cookies not set — Marketplace scraping will return empty results'}
          </div>
        </section>

        <section className="settings-section">
          <h3>🔍 Default Filters</h3>
          <div className="form-row">
            <div className="form-group">
              <label>Min Price ($)</label>
              <input
                type="number"
                value={form.minPrice || ''}
                onChange={e => updateField('minPrice', e.target.value)}
                placeholder="0"
                className="url-input"
              />
            </div>
            <div className="form-group">
              <label>Max Price ($)</label>
              <input
                type="number"
                value={form.maxPrice || ''}
                onChange={e => updateField('maxPrice', e.target.value)}
                placeholder="1000"
                className="url-input"
              />
            </div>
          </div>
          <div className="form-group">
            <label>Keyword Blacklist</label>
            <input
              type="text"
              value={form.keywordBlacklist || ''}
              onChange={e => updateField('keywordBlacklist', e.target.value)}
              placeholder="refurbished, broken, parts (comma separated)"
              className="url-input"
            />
            <span className="form-hint">Listings matching these keywords will be hidden</span>
          </div>
        </section>

        <button type="submit" className="scrape-btn" disabled={saving}>
          {saving ? <span className="spinner" /> : '💾'} {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </form>
    </div>
  );
}
