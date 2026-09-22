import {act,fireEvent,render,screen,waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach,describe,expect,it,vi} from 'vitest';
import ControlledBetaPage,{ControlledBetaView} from './ControlledBetaPage';
import {controlledBetaFixture} from '@/test/controlledBetaFixture';

afterEach(()=>{vi.useRealTimers();vi.unstubAllGlobals();});
describe('controlled beta real-artifact surface',()=>{
  it('separates unavailable value, historical performance and audit-only presence',async()=>{
    const user=userEvent.setup();render(<ControlledBetaView artifact={controlledBetaFixture()}/>);
    expect(screen.getByText('Values are not yet supported for this capture.')).toBeInTheDocument();
    expect(screen.getByLabelText('No supported value for Historical Passer')).toHaveTextContent('—');
    const summary=screen.getByText('Evidence and explanation for Historical Passer');
    summary.focus();expect(summary).toHaveFocus();await user.click(summary);
    expect(summary.closest('details')).toHaveAttribute('open');
    expect(screen.getByText('900')).toBeVisible();
    expect(screen.getByText(/their role-reference mapping is incomplete/)).toBeVisible();
    await user.selectOptions(screen.getByLabelText('Population'),'excluded');
    expect(screen.getByText('Reserve Runner')).toBeInTheDocument();
    expect(screen.queryByText('Historical Passer')).not.toBeInTheDocument();
    expect(screen.getByText(/Audit candidate · not admitted/)).toBeInTheDocument();
    await user.selectOptions(screen.getByLabelText('Position'),'QB');
    expect(screen.getByText('No players match these filters.')).toBeInTheDocument();
  });
  it('updates evidence age while mounted and after visibility resumes without fetching model data',()=>{
    vi.useFakeTimers();vi.setSystemTime(new Date('2026-09-22T15:00:00.000Z'));
    const request=vi.fn();vi.stubGlobal('fetch',request);
    render(<ControlledBetaView artifact={controlledBetaFixture()}/>);
    expect(screen.getByText(/Evidence age: 12.0 hours · current/)).toBeInTheDocument();
    act(()=>vi.advanceTimersByTime(60*60*1000));
    expect(screen.getByText(/Evidence age: 13.0 hours · stale/)).toBeInTheDocument();
    vi.setSystemTime(new Date('2026-10-02T03:00:00.000Z'));
    Object.defineProperty(document,'visibilityState',{configurable:true,value:'visible'});
    fireEvent(document,new Event('visibilitychange'));
    expect(screen.getByText(/Evidence age: 240.0 hours · expired/)).toBeInTheDocument();expect(request).not.toHaveBeenCalled();
  });
  it('fetches only its explicit private artifact, never external market or production board',async()=>{
    const request=vi.fn().mockResolvedValue(new Response(JSON.stringify(controlledBetaFixture()),{status:200}));
    vi.stubGlobal('fetch',request);render(<ControlledBetaPage/>);
    await screen.findByText('Historical Passer');
    expect(request).toHaveBeenCalledTimes(1);expect(request.mock.calls[0][0]).toBe('/__controlled-beta/evaluation.json');
  });
  it('refuses a malformed or numerically leaking artifact without any demo fallback',async()=>{
    const bad=controlledBetaFixture();Object.assign(bad.players[0],{dynastyValue:99});
    const request=vi.fn().mockResolvedValue(new Response(JSON.stringify(bad),{status:200}));vi.stubGlobal('fetch',request);render(<ControlledBetaPage/>);
    await waitFor(()=>expect(screen.getByText('Controlled preview unavailable')).toBeInTheDocument());
    expect(screen.queryByText('Historical Passer')).not.toBeInTheDocument();expect(request).toHaveBeenCalledTimes(1);
  });
});
